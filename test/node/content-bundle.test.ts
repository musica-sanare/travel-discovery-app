/**
 * Every content bundle in content/ must import cleanly (ADR-028): valid
 * envelope and references, every item accepted by the admin API validation,
 * and every item translated into each locale its version covers (docs/en/OPERATIONS.md 8).
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
import { SUPPORTED_LOCALES, type Locale } from "../../shared/locales";

const CONTENT_DIR = path.resolve(import.meta.dirname, "../../content");
const SCHEMAS: Record<ImportKind, z.ZodType> = {
  countries: countryInput,
  attributes: attributeInput,
  categories: categoryInput,
  destinations: destinationInput,
  questions: questionInput,
};

const files = readdirSync(CONTENT_DIR).filter((name) => name.endsWith(".json"));

/** Bundles before initial-v7.json predate `fr` (ADR-032); later ones cover every locale. */
function requiredLocales(file: string): readonly Locale[] {
  const version = Number(/^initial-v(\d+)\.json$/.exec(file)?.[1]);
  return version < 7 ? ["ja", "en", "es"] : SUPPORTED_LOCALES;
}

it("content/ contains at least one bundle", () => {
  expect(files.length).toBeGreaterThan(0);
});

/** Bundles from initial-v9.json on carry a location for every destination (ADR-036). */
const withLocations = files.filter((file) => Number(/^initial-v(\d+)\.json$/.exec(file)?.[1]) >= 9);

describe.each(withLocations)("%s locations", (file) => {
  const bundle = JSON.parse(readFileSync(path.join(CONTENT_DIR, file), "utf8")) as {
    destinations: { slug: string; location?: { latitude: number; longitude: number } | null }[];
  };

  it("gives every destination a representative point rounded to two decimals", () => {
    const invalid = bundle.destinations
      .filter(({ location }) => {
        if (!location) return true;
        return [location.latitude, location.longitude].some((value) => Math.round(value * 100) / 100 !== value);
      })
      .map((entry) => entry.slug);
    expect(invalid).toEqual([]);
  });
});

it("initial-v9.json differs from initial-v8.json only by destination locations", () => {
  const read = (file: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, file), "utf8")) as Record<string, unknown>;
  const v9 = read("initial-v9.json") as { destinations: Record<string, unknown>[] };
  const withoutLocations = {
    ...v9,
    destinations: v9.destinations.map((destination) => {
      const rest = { ...destination };
      delete rest.location;
      return rest;
    }),
  };
  expect(withoutLocations).toEqual(read("initial-v8.json"));
});

it("initial-v10.json keeps every item of initial-v9.json unchanged and only adds new ones", () => {
  type Bundle = Record<string, { slug: string }[] | string | number>;
  const read = (file: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, file), "utf8")) as Bundle;
  const [v9, v10] = [read("initial-v9.json"), read("initial-v10.json")];
  for (const key of Object.keys(v9)) {
    const before = v9[key];
    const after = v10[key];
    if (!Array.isArray(before) || !Array.isArray(after)) {
      expect(after).toEqual(before);
      continue;
    }
    expect(after.slice(0, before.length)).toEqual(before);
  }
  expect(Object.keys(v10)).toEqual(Object.keys(v9));
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

  it(`translates every item into ${requiredLocales(file).join(", ")}`, () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const missing = IMPORT_KINDS.flatMap((kind) =>
      parsed.bundle[kind].flatMap((entry) => {
        const translations = entry.data.translations as Record<string, unknown>;
        return requiredLocales(file).filter((locale) => !translations[locale]).map((locale) => `${kind}/${entry.slug}/${locale}`);
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

  // Unscored attributes lower coverage instead of counting as 0 (docs/en/DIAGNOSTIC_ALGORITHM.md §3).
  it("scores every active attribute for every published destination", () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const active = parsed.bundle.attributes.filter((entry) => entry.data.status === "active").map((entry) => entry.slug);
    const missing = parsed.bundle.destinations
      .filter((entry) => entry.data.status === "published")
      .flatMap((entry) => {
        const scored = new Set((entry.data.attributeScores as { attribute: string }[]).map((score) => score.attribute));
        return active.filter((slug) => !scored.has(slug)).map((slug) => `${entry.slug}/${slug}`);
      });
    expect(missing).toEqual([]);
  });

  it("affects every active attribute by at least one published question", () => {
    if (!parsed.bundle) throw new Error("invalid bundle");
    const affected = new Set(
      parsed.bundle.questions
        .filter((entry) => entry.data.status === "published")
        .flatMap((entry) => (entry.data.options as { effects: { attribute: string }[] }[]).flatMap((option) => option.effects))
        .map((effect) => effect.attribute),
    );
    const unaffected = parsed.bundle.attributes
      .filter((entry) => entry.data.status === "active" && !affected.has(entry.slug))
      .map((entry) => entry.slug);
    expect(unaffected).toEqual([]);
  });
});
