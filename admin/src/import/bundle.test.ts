import { describe, expect, it } from "vitest";
import { IMPORT_KINDS, parseBundle, planImport, toPayload, type ExistingIds, type ImportBundle } from "./bundle";

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
