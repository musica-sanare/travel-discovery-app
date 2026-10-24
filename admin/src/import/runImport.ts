/**
 * Runs a planned import through the existing admin API, one item per request
 * (Workers Free allows 50 D1 queries per invocation, ADR-015). Stops at the
 * first failure; created and updated items stay, and a rerun skips or finds
 * them unchanged.
 */
import type { DestinationDetail, TaxonomyItem } from "../types";
import {
  IMPORT_KINDS,
  toPayload,
  type ExistingIds,
  type ImportBundle,
  type ImportKind,
  type PlanStep,
} from "./bundle";

export type AdminCall = <T>(path: string, init?: { method?: "GET" | "POST" | "PUT"; body?: unknown }) => Promise<T>;

export type StepState = "pending" | "created" | "updated" | "skipped" | "unchanged" | "failed";

/** A destination was changed after the check, so the planned update is stale. */
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

async function getDestination(api: AdminCall, id: number): Promise<DestinationDetail> {
  const { item } = await api<{ item: DestinationDetail }>(`/destinations/${String(id)}`);
  return item;
}

/** Loads the stored version of every bundle destination that already exists (update mode). */
export async function loadCurrentDestinations(
  api: AdminCall,
  bundle: ImportBundle,
  existing: ExistingIds,
): Promise<Map<string, DestinationDetail>> {
  const current = new Map<string, DestinationDetail>();
  for (const { slug } of bundle.destinations) {
    const id = existing.destinations.get(slug);
    if (id !== undefined) current.set(slug, await getDestination(api, id));
  }
  return current;
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
          const id = ids.destinations.get(step.slug);
          if (id === undefined) throw new Error("Update planned for a destination without an ID");
          // No server-side version check exists; this narrows the window for overwriting a concurrent edit.
          if ((await getDestination(api, id)).updatedAt !== step.updatedAt) throw new ImportConflictError(step.slug);
          await api(`/destinations/${String(id)}`, { method: "PUT", body: toPayload(step.kind, entry, ids) });
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
