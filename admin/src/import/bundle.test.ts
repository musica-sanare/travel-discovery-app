import { describe, expect, it } from "vitest";
import type { DestinationDetail, QuestionDetail, TaxonomyItem } from "../types";
import {
  IMPORT_KINDS,
  parseBundle,
  planImport,
  toPayload,
  type CurrentContent,
  type ExistingIds,
  type ImportBundle,
} from "./bundle";

function noneExisting(): ExistingIds {
  return Object.fromEntries(IMPORT_KINDS.map((kind) => [kind, new Map<string, number>()])) as ExistingIds;
}

const DESTINATION = {
  slug: "bangkok",
  country: "thailand",
  type: "city",
  status: "published",
  attributeScores: [{ attribute: "food", score: 5 }],
  translations: { ja: { name: "バンコク", summary: "屋台の街。" } },
};

const QUESTION = {
  slug: "focus",
  category: "style",
  type: "single_choice",
  status: "published",
  priorityWeight: 5,
  displayOrder: null,
  translations: { ja: { prompt: "何をしたい？" } },
  options: [
    { value: "eat", displayOrder: 0, translations: { ja: { label: "食べる" } }, effects: [{ attribute: "food", weight: 3 }] },
    { value: "rest", displayOrder: 1, translations: { ja: { label: "休む" } }, effects: [] },
  ],
};

const COUNTRY = { slug: "thailand", translations: { ja: { name: "タイ" } } };

const VALID = {
  format: "travel-discovery-content",
  version: 1,
  countries: [COUNTRY],
  attributes: [{ slug: "food", status: "active", translations: { ja: { name: "食" } } }],
  categories: [{ slug: "style", status: "active", translations: { ja: { name: "スタイル" } } }],
  destinations: [DESTINATION],
  questions: [QUESTION],
};

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("empty list");
  return item;
}

function parsed(value: unknown = VALID): ImportBundle {
  const result = parseBundle(JSON.stringify(value));
  if (!result.bundle) throw new Error(JSON.stringify(result.issues));
  return result.bundle;
}

describe("parseBundle", () => {
  it("accepts a valid bundle and keeps the entries in order", () => {
    const bundle = parsed();
    expect(bundle.destinations.map((entry) => entry.slug)).toEqual(["bangkok"]);
    expect(first(bundle.questions).data.category).toBe("style");
  });

  it("treats missing sections as empty", () => {
    const bundle = parsed({ format: "travel-discovery-content", version: 1, countries: VALID.countries });
    expect(bundle.questions).toEqual([]);
  });

  it.each([
    ["not JSON", "{", "invalid_json", ""],
    ["wrong format", JSON.stringify({ ...VALID, format: "other" }), "invalid_format", ""],
    ["wrong version", JSON.stringify({ ...VALID, version: 2 }), "invalid_format", ""],
    ["section not a list", JSON.stringify({ ...VALID, countries: {} }), "invalid_format", "countries"],
    ["entry not an object", JSON.stringify({ ...VALID, countries: ["x"] }), "invalid_entry", "countries[0]"],
    ["bad slug", JSON.stringify({ ...VALID, countries: [{ slug: "Thai Land" }] }), "invalid_slug", "countries[0].slug"],
    [
      "duplicate slug",
      JSON.stringify({ ...VALID, countries: [...VALID.countries, ...VALID.countries] }),
      "duplicate_slug",
      "countries[1].slug",
    ],
  ])("rejects %s", (_name, text, code, path) => {
    const result = parseBundle(text);
    expect(result.bundle).toBeNull();
    expect(result.issues).toContainEqual({ code, path });
  });
});

describe("planImport", () => {
  it("creates new entries in dependency order", () => {
    const { steps, issues } = planImport(parsed(), noneExisting());
    expect(issues).toEqual([]);
    expect(steps.map((step) => `${step.kind}:${step.slug}:${step.action}`)).toEqual([
      "countries:thailand:create",
      "attributes:food:create",
      "categories:style:create",
      "destinations:bangkok:create",
      "questions:focus:create",
    ]);
  });

  it("skips entries whose slug already exists and resolves references to them", () => {
    const existing = noneExisting();
    existing.countries.set("thailand", 7);
    const bundle = parsed({ ...VALID, countries: [] });
    const { steps, issues } = planImport(bundle, existing);
    expect(issues).toEqual([]);
    expect(steps.find((step) => step.slug === "thailand")).toBeUndefined();

    const withCountry = planImport(parsed(), existing);
    expect(withCountry.steps[0]).toEqual({ kind: "countries", slug: "thailand", action: "skip" });
  });

  it("reports every unknown reference with its path", () => {
    const value = {
      ...VALID,
      destinations: [{ ...DESTINATION, country: "nowhere", attributeScores: [{ attribute: "missing", score: 5 }] }],
      questions: [
        {
          ...QUESTION,
          category: "missing",
          options: [{ ...first(QUESTION.options), effects: [{ attribute: "missing", weight: 3 }] }],
        },
      ],
    };
    const { issues } = planImport(parsed(value), noneExisting());
    expect(issues.map((issue) => issue.path)).toEqual([
      "destinations[0].country",
      "destinations[0].attributeScores[0].attribute",
      "questions[0].category",
      "questions[0].options[0].effects[0].attribute",
    ]);
    expect(new Set(issues.map((issue) => issue.code))).toEqual(new Set(["unknown_reference"]));
  });

  it("reports a missing reference field", () => {
    const withoutCountry: Partial<typeof DESTINATION> = { ...DESTINATION };
    delete withoutCountry.country;
    const { issues } = planImport(parsed({ ...VALID, destinations: [withoutCountry] }), noneExisting());
    expect(issues).toEqual([{ code: "unknown_reference", path: "destinations[0].country" }]);
  });
});

describe("planImport in update mode", () => {
  function existingContent(): ExistingIds {
    const existing = noneExisting();
    existing.countries.set("thailand", 3);
    existing.attributes.set("food", 11);
    existing.categories.set("style", 5);
    existing.destinations.set("bangkok", 20);
    existing.questions.set("focus", 30);
    return existing;
  }

  const STORED: DestinationDetail = {
    id: 20,
    slug: "bangkok",
    countryId: 3,
    type: "city",
    status: "published",
    recommendedDays: { min: null, max: null },
    bestMonths: [],
    location: null,
    costs: [],
    image: null,
    translations: {
      ja: { name: "バンコク", summary: "屋台の街。", highlights: [], cautions: null, bestSeason: null, imageAlt: null },
    },
    attributeScores: [{ attributeId: 11, score: 5 }],
    updatedAt: "2026-10-24T03:40:00.000Z",
  };

  const UPDATED_AT = "2026-10-24T03:40:00.000Z";

  const STORED_QUESTION: QuestionDetail = {
    id: 30,
    slug: "focus",
    categoryId: 5,
    type: "single_choice",
    status: "published",
    priorityWeight: 5,
    displayOrder: null,
    translations: { ja: { prompt: "何をしたい？", description: null } },
    options: [
      { value: "eat", displayOrder: 0, status: "active", translations: { ja: { label: "食べる" } }, effects: [{ attributeId: 11, weight: 3 }] },
      { value: "rest", displayOrder: 1, status: "active", translations: { ja: { label: "休む" } }, effects: [] },
      { value: "shop", displayOrder: 2, status: "archived", translations: { ja: { label: "買う" } }, effects: [] },
    ],
    updatedAt: UPDATED_AT,
  };

  function taxonomy(id: number, slug: string, fields: Partial<TaxonomyItem>): Map<string, TaxonomyItem> {
    return new Map([[slug, { id, slug, translations: {}, updatedAt: UPDATED_AT, ...fields }]]);
  }

  /** Stored content that matches `VALID`; `overrides` replaces whole kinds. */
  function currentContent(overrides: Partial<CurrentContent> = {}): CurrentContent {
    return {
      countries: taxonomy(3, "thailand", { translations: { ja: { name: "タイ" } } }),
      attributes: taxonomy(11, "food", { status: "active", translations: { ja: { name: "食", description: null } } }),
      categories: taxonomy(5, "style", { status: "active", translations: { ja: { name: "スタイル" } } }),
      destinations: new Map([["bangkok", STORED]]),
      questions: new Map([["focus", STORED_QUESTION]]),
      ...overrides,
    };
  }

  function emptyContent(): CurrentContent {
    return { countries: new Map(), attributes: new Map(), categories: new Map(), destinations: new Map(), questions: new Map() };
  }

  it("plans an update with the changes and the stored updatedAt, and skips items that were not loaded", () => {
    const current = { ...emptyContent(), destinations: new Map([["bangkok", { ...STORED, bestMonths: [1, 2] }]]) };
    const { steps, issues } = planImport(parsed(), existingContent(), current);
    expect(issues).toEqual([]);
    expect(steps.map((step) => `${step.kind}:${step.action}`)).toEqual([
      "countries:skip",
      "attributes:skip",
      "categories:skip",
      "destinations:update",
      "questions:skip",
    ]);
    expect(steps[3]).toEqual({
      kind: "destinations",
      slug: "bangkok",
      action: "update",
      changes: [{ path: "bestMonths", before: [1, 2], after: [] }],
      updatedAt: "2026-10-24T03:40:00.000Z",
    });
  });

  it("plans every existing item that matches the file as unchanged, ignoring archived options", () => {
    const { steps, issues } = planImport(parsed(), existingContent(), currentContent());
    expect(issues).toEqual([]);
    expect(steps.map((step) => step.action)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"]);
  });

  it("plans updates for countries, attributes, and categories with new translations", () => {
    const file = {
      ...VALID,
      countries: [{ ...COUNTRY, translations: { ...COUNTRY.translations, fr: { name: "Thaïlande" } } }],
      attributes: [{ slug: "food", status: "active", translations: { ja: { name: "食" }, fr: { name: " Gastronomie ", description: "" } } }],
      categories: [{ slug: "style", status: "archived", translations: { ja: { name: "スタイル" } } }],
    };
    const { steps } = planImport(parsed(file), existingContent(), currentContent());
    expect(steps.slice(0, 3)).toEqual([
      {
        kind: "countries",
        slug: "thailand",
        action: "update",
        changes: [{ path: "translations.fr", before: undefined, after: { name: "Thaïlande" } }],
        updatedAt: UPDATED_AT,
      },
      {
        kind: "attributes",
        slug: "food",
        action: "update",
        changes: [{ path: "translations.fr", before: undefined, after: { name: "Gastronomie", description: null } }],
        updatedAt: UPDATED_AT,
      },
      {
        kind: "categories",
        slug: "style",
        action: "update",
        changes: [{ path: "status", before: "active", after: "archived" }],
        updatedAt: UPDATED_AT,
      },
    ]);
  });

  it("plans a question update with option-level changes and a re-listed archived option", () => {
    const [eat, rest] = QUESTION.options;
    const file = {
      ...VALID,
      questions: [
        {
          ...QUESTION,
          translations: { ...QUESTION.translations, fr: { prompt: "Que voulez-vous faire ?" } },
          options: [
            { ...eat, translations: { ...eat?.translations, fr: { label: "Manger" } } },
            rest,
            { value: "shop", displayOrder: 2, translations: { ja: { label: "買う" } }, effects: [] },
          ],
        },
      ],
    };
    const { steps, issues } = planImport(parsed(file), existingContent(), currentContent());
    expect(issues).toEqual([]);
    expect(steps[4]).toMatchObject({ kind: "questions", slug: "focus", action: "update", updatedAt: UPDATED_AT });
    expect(steps[4]?.action === "update" && steps[4].changes.map((change) => change.path)).toEqual([
      "translations.fr",
      "options.eat.translations.fr",
      "options.shop",
    ]);
  });

  it("refuses a question update that would archive an active option", () => {
    const file = { ...VALID, questions: [{ ...QUESTION, options: QUESTION.options.slice(0, 1) }] };
    const { issues } = planImport(parsed(file), existingContent(), currentContent());
    expect(issues).toEqual([{ code: "missing_option", path: "questions[0].options[value=rest]" }]);
  });

  it("skips existing destinations without update mode", () => {
    const { steps } = planImport(parsed(), existingContent());
    expect(steps[3]).toEqual({ kind: "destinations", slug: "bangkok", action: "skip" });
  });
});

describe("toPayload", () => {
  it("replaces slug references with IDs and keeps the other fields", () => {
    const bundle = parsed();
    const ids = noneExisting();
    ids.countries.set("thailand", 3);
    ids.attributes.set("food", 11);
    ids.categories.set("style", 5);

    const destination = toPayload("destinations", first(bundle.destinations), ids);
    expect(destination).toMatchObject({ slug: "bangkok", countryId: 3, attributeScores: [{ attributeId: 11, score: 5 }] });
    expect(destination).not.toHaveProperty("country");

    const question = toPayload("questions", first(bundle.questions), ids);
    expect(question).toMatchObject({
      slug: "focus",
      categoryId: 5,
      options: [{ value: "eat", effects: [{ attributeId: 11, weight: 3 }] }, { value: "rest", effects: [] }],
    });
    expect(question).not.toHaveProperty("category");
    expect(toPayload("countries", first(bundle.countries), ids)).toEqual(COUNTRY);
  });
});
