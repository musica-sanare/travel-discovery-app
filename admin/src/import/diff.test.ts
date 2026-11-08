import { describe, expect, it } from "vitest";
import type { DestinationDetail } from "../types";
import { destinationFromBundle, destinationFromStored, diffComparable } from "./diff";

const SLUGS = {
  countries: new Map([[1, "peru"]]),
  attributes: new Map([
    [10, "nature"],
    [11, "food"],
  ]),
  categories: new Map([[20, "interests"]]),
};

const JPY = {
  currency: "JPY" as const,
  period: "per_day" as const,
  scope: "per_person_excluding_international_flights" as const,
  min: 8000,
  max: 15000,
  sourceName: "Survey",
  sourceUrl: null,
  updatedAt: "2026-10-24",
  basis: { ja: "調査に基づく目安", en: "Based on a survey" },
};

function stored(overrides: Partial<DestinationDetail> = {}): DestinationDetail {
  return {
    id: 5,
    slug: "cusco",
    countryId: 1,
    type: "city",
    status: "published",
    recommendedDays: { min: 3, max: 5 },
    bestMonths: [5, 6, 7],
    location: { latitude: -13.52, longitude: -71.98 },
    costs: [JPY],
    image: null,
    translations: {
      ja: { name: "クスコ", summary: "インカの都。", highlights: ["遺跡"], cautions: null, bestSeason: null, imageAlt: null },
    },
    attributeScores: [
      { attributeId: 10, score: 4 },
      { attributeId: 11, score: 2 },
    ],
    updatedAt: "2026-10-24T03:40:00.000Z",
    ...overrides,
  };
}

/** The same destination as a bundle entry, written loosely as authors do. */
const ENTRY = {
  slug: "cusco",
  country: "peru",
  type: "city",
  status: "published",
  recommendedDays: { min: 3, max: 5 },
  bestMonths: [7, 5, 6],
  location: { latitude: -13.52, longitude: -71.98 },
  costs: [{ ...JPY, sourceUrl: undefined, basis: { ...JPY.basis, es: "" } }],
  image: null,
  attributeScores: [
    { attribute: "food", score: 2 },
    { attribute: "nature", score: 4 },
  ],
  translations: { ja: { name: " クスコ ", summary: "インカの都。", highlights: ["遺跡"], cautions: "", bestSeason: null } },
};

function diff(entry: Record<string, unknown>, item = stored()) {
  return diffComparable(destinationFromStored(item, SLUGS), destinationFromBundle(entry));
}

describe("diffComparable on destinations", () => {
  it("finds no change when the file matches the stored destination after the API defaults", () => {
    expect(diff(ENTRY)).toEqual([]);
  });

  it("treats omitted optional sections like their stored defaults", () => {
    const item = stored({ bestMonths: [], costs: [] });
    const entry: Record<string, unknown> = { ...ENTRY };
    delete entry.bestMonths;
    delete entry.costs;
    expect(diff(entry, item)).toEqual([]);
  });

  it("lists each changed field with its value before and after", () => {
    const entry = {
      ...ENTRY,
      status: "draft",
      bestMonths: [6, 7],
      costs: [{ ...JPY, max: 16000 }],
      attributeScores: [{ attribute: "nature", score: 5 }],
      translations: {
        ja: { ...ENTRY.translations.ja, bestSeason: "乾季（5〜9月）" },
        en: { name: "Cusco", summary: "The Inca capital." },
      },
    };
    expect(diff(entry)).toEqual([
      { path: "status", before: "published", after: "draft" },
      { path: "bestMonths", before: [5, 6, 7], after: [6, 7] },
      { path: "costs.JPY.max", before: 15000, after: 16000 },
      { path: "translations.ja.bestSeason", before: null, after: "乾季（5〜9月）" },
      {
        path: "translations.en",
        before: undefined,
        after: { name: "Cusco", summary: "The Inca capital.", highlights: [], cautions: null, bestSeason: null, imageAlt: null },
      },
      { path: "attributeScores.food", before: 2, after: undefined },
      { path: "attributeScores.nature", before: 4, after: 5 },
    ]);
  });

  it("reports an added and a removed cost estimate as a whole", () => {
    const added = diff(ENTRY, stored({ costs: [] }));
    expect(added).toEqual([{ path: "costs.JPY", before: undefined, after: expect.objectContaining({ min: 8000 }) as unknown }]);
    const removed = diff({ ...ENTRY, costs: [] });
    expect(removed).toEqual([{ path: "costs.JPY", before: expect.objectContaining({ min: 8000 }) as unknown, after: undefined }]);
  });

  it("treats an omitted location like no location and reports coordinate changes", () => {
    const entry: Record<string, unknown> = { ...ENTRY };
    delete entry.location;
    expect(diff(entry, stored({ location: null }))).toEqual([]);
    expect(diff(entry)).toEqual([
      { path: "location", before: { latitude: -13.52, longitude: -71.98 }, after: null },
    ]);
    expect(diff(ENTRY, stored({ location: null }))).toEqual([
      { path: "location", before: null, after: { latitude: -13.52, longitude: -71.98 } },
    ]);
    expect(diff({ ...ENTRY, location: { latitude: -13.53, longitude: -71.98 } })).toEqual([
      { path: "location.latitude", before: -13.52, after: -13.53 },
    ]);
  });

  it("shows stored references that have no known slug by their ID", () => {
    const changes = diff(ENTRY, stored({ countryId: 99 }));
    expect(changes).toEqual([{ path: "country", before: "#99", after: "peru" }]);
  });
});
