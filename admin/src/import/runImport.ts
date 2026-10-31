/**
 * Runs a planned import through the existing admin API, one item per request
 * (Workers Free allows 50 D1 queries per invocation, ADR-015). Stops at the
 * first failure; created and updated items stay, and a rerun skips or finds
 * them unchanged.
 */
import { AdminApiError } from "../api";
import type { DestinationDetail, QuestionDetail, TaxonomyItem } from "../types";
import {
  IMPORT_KINDS,
  toPayload,
  type CurrentContent,
  type ExistingIds,
  type ImportBundle,
  type ImportKind,
  type PlanStep,
} from "./bundle";

export type AdminCall = <T>(path: string, init?: { method?: "GET" | "POST" | "PUT"; body?: unknown }) => Promise<T>;

export type StepState = "pending" | "created" | "updated" | "skipped" | "unchanged" | "failed";

/** Longer than the admin rate limit period (60 s, wrangler.admin.jsonc). */
export const RATE_LIMIT_WAIT_MS = 61_000;
const RATE_LIMIT_RETRIES = 3;

/**
 * Retries a call refused by the admin rate limit after a wait. The limit is
 * checked before any handler runs, so a refused write wrote nothing and is
 * safe to resend. Large update imports need more requests than one period
 * allows.
 */
export function retryOnRateLimit(
  api: AdminCall,
  onWait: (waiting: boolean) => void,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): AdminCall {
  return async <T>(path: string, init?: Parameters<AdminCall>[1]): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await api<T>(path, init);
      } catch (error) {
        if (!(error instanceof AdminApiError && error.code === "rate_limited") || attempt >= RATE_LIMIT_RETRIES) {
          throw error;
        }
        onWait(true);
        await sleep(RATE_LIMIT_WAIT_MS);
        onWait(false);
      }
    }
  };
}

/** An item was changed after the check, so the planned update is stale. */
export class ImportConflictError extends Error {
  constructor(readonly slug: string) {
    super("changed_since_check");
    this.name = "ImportConflictError";
  }
}

export interface ImportOutcome {
  states: StepState[];
  error: unknown;
}

interface SlugPage {
  items: { id: number; slug: string }[];
  hasMore: boolean;
}

/** Loads the slugs and IDs of all existing content (every status). */
export async function loadExisting(api: AdminCall): Promise<ExistingIds> {
  const existing = Object.fromEntries(IMPORT_KINDS.map((kind) => [kind, new Map<string, number>()])) as ExistingIds;
  for (const kind of ["countries", "attributes", "categories"] as const) {
    const { items } = await api<{ items: TaxonomyItem[] }>(`/${kind}`);
    for (const item of items) existing[kind].set(item.slug, item.id);
  }
  for (const kind of ["destinations", "questions"] as const) {
    for (let page = 1; ; page += 1) {
      const result = await api<SlugPage>(`/${kind}?page=${String(page)}`);
      for (const item of result.items) existing[kind].set(item.slug, item.id);
      if (!result.hasMore) break;
    }
  }
  return existing;
}

const TAXONOMY_KINDS = ["countries", "attributes", "categories"] as const;
type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

function isTaxonomyKind(kind: ImportKind): kind is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly ImportKind[]).includes(kind);
}

async function getTaxonomy(api: AdminCall, kind: TaxonomyKind): Promise<TaxonomyItem[]> {
  return (await api<{ items: TaxonomyItem[] }>(`/${kind}`)).items;
}

async function getItem<T>(api: AdminCall, kind: "destinations" | "questions", id: number): Promise<T> {
  const { item } = await api<{ item: T }>(`/${kind}/${String(id)}`);
  return item;
}

/** The stored `updatedAt` of one item; taxonomy has no detail endpoint, so its list is read. */
async function readUpdatedAt(api: AdminCall, kind: ImportKind, id: number): Promise<string | undefined> {
  if (isTaxonomyKind(kind)) {
    return (await getTaxonomy(api, kind)).find((item) => item.id === id)?.updatedAt;
  }
  return (await getItem<{ updatedAt: string }>(api, kind, id)).updatedAt;
}

/** Loads the stored version of every bundle item that already exists (update mode). */
export async function loadCurrent(api: AdminCall, bundle: ImportBundle, existing: ExistingIds): Promise<CurrentContent> {
  const existingIn = (kind: ImportKind) => bundle[kind].filter(({ slug }) => existing[kind].has(slug));
  const taxonomy = async (kind: TaxonomyKind) => {
    const wanted = new Set(existingIn(kind).map(({ slug }) => slug));
    const items = wanted.size > 0 ? await getTaxonomy(api, kind) : [];
    return new Map(items.filter((item) => wanted.has(item.slug)).map((item) => [item.slug, item]));
  };
  const details = async <T>(kind: "destinations" | "questions") => {
    const result = new Map<string, T>();
    for (const { slug } of existingIn(kind)) {
      const id = existing[kind].get(slug);
      if (id !== undefined) result.set(slug, await getItem<T>(api, kind, id));
    }
    return result;
  };
  return {
    countries: await taxonomy("countries"),
    attributes: await taxonomy("attributes"),
    categories: await taxonomy("categories"),
    destinations: await details<DestinationDetail>("destinations"),
    questions: await details<QuestionDetail>("questions"),
  };
}

export async function runImport(
  api: AdminCall,
  bundle: ImportBundle,
  steps: readonly PlanStep[],
  existing: ExistingIds,
  onProgress: (states: StepState[]) => void,
): Promise<ImportOutcome> {
  const ids = Object.fromEntries(IMPORT_KINDS.map((kind) => [kind, new Map(existing[kind])])) as ExistingIds;
  const states: StepState[] = steps.map(() => "pending");
  const entryFor = (kind: ImportKind, slug: string) => bundle[kind].find((entry) => entry.slug === slug);

  for (const [index, step] of steps.entries()) {
    const entry = entryFor(step.kind, step.slug);
    if (step.action === "unchanged") {
      states[index] = "unchanged";
    } else if (step.action === "skip" || !entry) {
      states[index] = "skipped";
    } else {
      try {
        if (step.action === "update") {
          const id = ids[step.kind].get(step.slug);
          if (id === undefined) throw new Error("Update planned for an item without an ID");
          // No server-side version check exists; this narrows the window for overwriting a concurrent edit.
          if ((await readUpdatedAt(api, step.kind, id)) !== step.updatedAt) throw new ImportConflictError(step.slug);
          await api(`/${step.kind}/${String(id)}`, { method: "PUT", body: toPayload(step.kind, entry, ids) });
          states[index] = "updated";
        } else {
          const { id } = await api<{ id: number }>(`/${step.kind}`, {
            method: "POST",
            body: toPayload(step.kind, entry, ids),
          });
          ids[step.kind].set(step.slug, id);
          states[index] = "created";
        }
      } catch (error) {
        states[index] = "failed";
        onProgress([...states]);
        return { states, error };
      }
    }
    onProgress([...states]);
  }
  return { states, error: null };
}
