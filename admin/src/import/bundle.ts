/**
 * Content bundle import (docs/working/DECISIONS.md ADR-028). The bundle uses the admin
 * API payloads, except that references are slugs instead of IDs. This module
 * only checks the envelope, slugs, and references; every item is validated by
 * the server when it is created.
 */
import { isSlug } from "../../../shared/slug";
import type { DestinationDetail, QuestionDetail, TaxonomyItem } from "../types";
import {
  destinationFromBundle,
  destinationFromStored,
  diffComparable,
  questionFromBundle,
  questionFromStored,
  taxonomyComparable,
  type FieldChange,
  type SlugMaps,
} from "./diff";

export const BUNDLE_FORMAT = "travel-discovery-content";
export const BUNDLE_VERSION = 1;

/** Creation order: later kinds reference earlier ones. */
export const IMPORT_KINDS = ["countries", "attributes", "categories", "destinations", "questions"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

type Json = Record<string, unknown>;

export interface BundleEntry {
  slug: string;
  data: Json;
}

export type ImportBundle = Record<ImportKind, BundleEntry[]>;

export type BundleIssueCode =
  | "invalid_json"
  | "invalid_format"
  | "invalid_entry"
  | "invalid_slug"
  | "duplicate_slug"
  | "unknown_reference"
  | "missing_option";

export interface BundleIssue {
  code: BundleIssueCode;
  path: string;
}

/** Slug → ID of the content that already exists, per kind. */
export type ExistingIds = Record<ImportKind, Map<string, number>>;

/** The stored version of every existing bundle item, by kind and slug (update mode). */
export interface CurrentContent {
  countries: ReadonlyMap<string, TaxonomyItem>;
  attributes: ReadonlyMap<string, TaxonomyItem>;
  categories: ReadonlyMap<string, TaxonomyItem>;
  destinations: ReadonlyMap<string, DestinationDetail>;
  questions: ReadonlyMap<string, QuestionDetail>;
}

/**
 * `update` is planned only in update mode, and only for existing items whose
 * stored content differs from the file; `updatedAt` is the stored value at
 * check time, re-checked just before the update is sent.
 */
export type PlanStep =
  | { kind: ImportKind; slug: string; action: "create" | "skip" | "unchanged" }
  | { kind: ImportKind; slug: string; action: "update"; changes: FieldChange[]; updatedAt: string };

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** Parses the bundle text; returns issues for the envelope and slugs only. */
export function parseBundle(text: string): { bundle: ImportBundle; issues: [] } | { bundle: null; issues: BundleIssue[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { bundle: null, issues: [{ code: "invalid_json", path: "" }] };
  }
  if (!isObject(value) || value.format !== BUNDLE_FORMAT || value.version !== BUNDLE_VERSION) {
    return { bundle: null, issues: [{ code: "invalid_format", path: "" }] };
  }

  const issues: BundleIssue[] = [];
  const bundle = {} as ImportBundle;
  for (const kind of IMPORT_KINDS) {
    const section = value[kind] ?? [];
    if (!Array.isArray(section)) {
      issues.push({ code: "invalid_format", path: kind });
      bundle[kind] = [];
      continue;
    }
    const seen = new Set<string>();
    bundle[kind] = (section as unknown[]).flatMap((item, index) => {
      const path = `${kind}[${String(index)}]`;
      if (!isObject(item)) {
        issues.push({ code: "invalid_entry", path });
        return [];
      }
      if (typeof item.slug !== "string" || !isSlug(item.slug)) {
        issues.push({ code: "invalid_slug", path: `${path}.slug` });
        return [];
      }
      if (seen.has(item.slug)) {
        issues.push({ code: "duplicate_slug", path: `${path}.slug` });
        return [];
      }
      seen.add(item.slug);
      return [{ slug: item.slug, data: item }];
    });
  }
  return issues.length > 0 ? { bundle: null, issues } : { bundle, issues: [] };
}

interface Reference {
  kind: ImportKind;
  slug: unknown;
  path: string;
}

/** Every slug reference in an entry, with the kind it must resolve to. */
function referencesOf(kind: ImportKind, entry: BundleEntry, index: number): Reference[] {
  const base = `${kind}[${String(index)}]`;
  if (kind === "destinations") {
    return [
      { kind: "countries", slug: entry.data.country, path: `${base}.country` },
      ...list(entry.data.attributeScores).map((score, i) => ({
        kind: "attributes" as const,
        slug: isObject(score) ? score.attribute : undefined,
        path: `${base}.attributeScores[${String(i)}].attribute`,
      })),
    ];
  }
  if (kind === "questions") {
    return [
      { kind: "categories", slug: entry.data.category, path: `${base}.category` },
      ...list(entry.data.options).flatMap((option, o) =>
        list(isObject(option) ? option.effects : undefined).map((effect, e) => ({
          kind: "attributes" as const,
          slug: isObject(effect) ? effect.attribute : undefined,
          path: `${base}.options[${String(o)}].effects[${String(e)}].attribute`,
        })),
      ),
    ];
  }
  return [];
}

function invert(map: ReadonlyMap<string, number>): Map<number, string> {
  return new Map([...map].map(([slug, id]) => [id, slug]));
}

interface StoredComparison {
  stored: Json;
  file: Json;
  updatedAt: string;
}

/** Both comparable shapes of an existing item, or undefined when it was not loaded. */
function compare(kind: ImportKind, entry: BundleEntry, current: CurrentContent, slugs: SlugMaps): StoredComparison | undefined {
  switch (kind) {
    case "countries":
    case "attributes":
    case "categories": {
      const item = current[kind].get(entry.slug);
      return item && { stored: taxonomyComparable(kind, item), file: taxonomyComparable(kind, entry.data), updatedAt: item.updatedAt };
    }
    case "destinations": {
      const item = current.destinations.get(entry.slug);
      return item && { stored: destinationFromStored(item, slugs), file: destinationFromBundle(entry.data), updatedAt: item.updatedAt };
    }
    case "questions": {
      const item = current.questions.get(entry.slug);
      return item && { stored: questionFromStored(item, slugs), file: questionFromBundle(entry.data), updatedAt: item.updatedAt };
    }
  }
}

/**
 * Active options of a stored question that the file lacks. A question `PUT`
 * archives them, so the import refuses instead of archiving silently.
 */
function missingOptions(entry: BundleEntry, stored: QuestionDetail | undefined): string[] {
  if (!stored) return [];
  const listed = new Set(list(entry.data.options).map((option) => (isObject(option) ? option.value : undefined)));
  return stored.options.filter((option) => option.status !== "archived" && !listed.has(option.value)).map((option) => option.value);
}

/**
 * Plans the import against existing content; every reference must resolve to
 * the bundle or to existing content. Entries whose slug exists are skipped,
 * except that items found in `current` (given only in update mode) are
 * compared with the file and planned as `update` or `unchanged`.
 */
export function planImport(
  bundle: ImportBundle,
  existing: ExistingIds,
  current?: CurrentContent,
): { steps: PlanStep[]; issues: BundleIssue[] } {
  const issues: BundleIssue[] = [];
  const known = (kind: ImportKind, slug: string) =>
    existing[kind].has(slug) || bundle[kind].some((entry) => entry.slug === slug);

  const slugs: SlugMaps = {
    countries: invert(existing.countries),
    attributes: invert(existing.attributes),
    categories: invert(existing.categories),
  };

  const steps = IMPORT_KINDS.flatMap((kind) =>
    bundle[kind].map((entry, index): PlanStep => {
      for (const reference of referencesOf(kind, entry, index)) {
        if (typeof reference.slug !== "string" || !known(reference.kind, reference.slug)) {
          issues.push({ code: "unknown_reference", path: reference.path });
        }
      }
      if (!existing[kind].has(entry.slug)) {
        return { kind, slug: entry.slug, action: "create" };
      }
      const comparison = current && compare(kind, entry, current, slugs);
      if (!comparison) {
        return { kind, slug: entry.slug, action: "skip" };
      }
      if (kind === "questions") {
        for (const value of missingOptions(entry, current.questions.get(entry.slug))) {
          issues.push({ code: "missing_option", path: `${kind}[${String(index)}].options[value=${value}]` });
        }
      }
      const changes = diffComparable(comparison.stored, comparison.file);
      return changes.length === 0
        ? { kind, slug: entry.slug, action: "unchanged" }
        : { kind, slug: entry.slug, action: "update", changes, updatedAt: comparison.updatedAt };
    }),
  );
  return { steps, issues };
}

function resolve(ids: ExistingIds, kind: ImportKind, slug: unknown): number {
  const id = typeof slug === "string" ? ids[kind].get(slug) : undefined;
  if (id === undefined) {
    // planImport rejects unresolved references before anything is created.
    throw new Error(`Unresolved ${kind} reference`);
  }
  return id;
}

/** The admin API payload for an entry, with slug references replaced by IDs. */
export function toPayload(kind: ImportKind, entry: BundleEntry, ids: ExistingIds): Json {
  if (kind === "destinations") {
    const { country, attributeScores, ...rest } = entry.data;
    return {
      ...rest,
      countryId: resolve(ids, "countries", country),
      attributeScores: list(attributeScores).map((score) => {
        const { attribute, ...scoreRest } = isObject(score) ? score : {};
        return { ...scoreRest, attributeId: resolve(ids, "attributes", attribute) };
      }),
    };
  }
  if (kind === "questions") {
    const { category, options, ...rest } = entry.data;
    return {
      ...rest,
      categoryId: resolve(ids, "categories", category),
      options: list(options).map((option) => {
        const { effects, ...optionRest } = isObject(option) ? option : {};
        return {
          ...optionRest,
          effects: list(effects).map((effect) => {
            const { attribute, ...effectRest } = isObject(effect) ? effect : {};
            return { ...effectRest, attributeId: resolve(ids, "attributes", attribute) };
          }),
        };
      }),
    };
  }
  return entry.data;
}
