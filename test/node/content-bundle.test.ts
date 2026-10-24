/**
 * Every content bundle in content/ must import cleanly (ADR-028): valid
 * envelope and references, every item accepted by the admin API validation,
 * and published items translated into all three locales (docs/OPERATIONS.md 8).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  IMPORT_KINDS,
  parseBundle,
  planImport,
  toPayload,
  type ExistingIds,
  type ImportKind,
} from "../../admin/src/import/bundle";
import {
  attributeInput,
  categoryInput,
  countryInput,
  destinationInput,
  questionInput,
} from "../../server/admin/validation";
import { SUPPORTED_LOCALES } from "../../shared/locales";

const CONTENT_DIR = path.resolve(import.meta.dirname, "../../content");
const SCHEMAS: Record<ImportKind, z.ZodType> = {
  countries: countryInput,
  attributes: attributeInput,
  categories: categoryInput,
  destinations: destinationInput,
  questions: questionInput,
};

const files = readdirSync(CONTENT_DIR).filter((name) => name.endsWith(".json"));

it("content/ contains at least one bundle", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe.each(files)("%s", (file) => {
  const parsed = parseBundle(readFileSync(path.join(CONTENT_DIR, file), "utf8"));

  it("has a valid envelope and resolvable references", () => {
    expect(parsed.issues).toEqual([]);
    if (!parsed.bundle) return;
    const none = Object.fromEntries(IMPORT_KINDS.map((kind) => [kind, new Map<string, number>()])) as ExistingIds;
    expect(planImport(parsed.bundle, none).issues).toEqual([]);
  });

  it("passes the admin API validation item by item", () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const ids = Object.fromEntries(IMPORT_KINDS.map((kind) => [kind, new Map<string, number>()])) as ExistingIds;
    let nextId = 1;
    const failures: string[] = [];
    for (const kind of IMPORT_KINDS) {
      for (const entry of parsed.bundle[kind]) {
        const result = SCHEMAS[kind].safeParse(toPayload(kind, entry, ids));
        if (!result.success) failures.push(`${kind}/${entry.slug}: ${result.error.message}`);
        ids[kind].set(entry.slug, nextId++);
      }
    }
    expect(failures).toEqual([]);
  });

  it("translates every item into ja, en, and es", () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const missing = IMPORT_KINDS.flatMap((kind) =>
      parsed.bundle[kind].flatMap((entry) => {
        const translations = entry.data.translations as Record<string, unknown>;
        return SUPPORTED_LOCALES.filter((locale) => !translations[locale]).map((locale) => `${kind}/${entry.slug}/${locale}`);
      }),
    );
    expect(missing).toEqual([]);
  });

  it("gives every question an option with a scoring effect", () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const withoutEffects = parsed.bundle.questions
      .filter((entry) => {
        const options = entry.data.options as { effects: unknown[] }[];
        return !options.some((option) => option.effects.length > 0);
      })
      .map((entry) => entry.slug);
    expect(withoutEffects).toEqual([]);
  });
});
