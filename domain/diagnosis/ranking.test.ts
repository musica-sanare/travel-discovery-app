import { describe, expect, it } from "vitest";
import { distinctiveStrengths, rankDestinations } from "./ranking";
import { LIMITS, attributes, content, destination, estimate, option, question } from "./test-fixtures";
import type { Answer, DiagnosisContent } from "./types";

const QUESTIONS = [
  question("pace", [option("relaxed", { beach: 2, "city-life": -1 }), option("active", { nature: 2, "city-life": 1 })]),
  question("interest", [option("food", { food: 3 }), option("scenery", { nature: 3 })], { category: "interests" }),
];

const DATA: DiagnosisContent = content({
  attributes: attributes("beach", "city-life", "food", "nature"),
  questions: QUESTIONS,
  destinations: [
    destination("lisbon", { food: 4, "city-life": 4, beach: 3, nature: 2 }, { recommendedDays: { min: 3, max: 6 }, bestMonths: [3, 4, 5, 9, 10, 11] }),
    destination("taipei", { food: 5, "city-life": 5, nature: 3, beach: 1 }, { recommendedDays: { min: 3, max: 5 } }),
    destination("south-iceland", { nature: 5, "city-life": 1, beach: 1 }, { recommendedDays: { min: 5, max: 10 } }),
    destination("da-nang", { beach: 5, food: 4 }, { status: "draft" }),
    destination("old-town", { food: 5 }, { status: "archived" }),
  ],
});

const ANSWERS: Answer[] = [
  { question: "pace", options: ["active"] },
  { question: "interest", options: ["scenery"] },
];

describe("rankDestinations", () => {
  it("ranks published destinations by fit", () => {
    const { results, notices } = rankDestinations(DATA, ANSWERS, {}, LIMITS);
    expect(results.map((item) => item.slug)).toEqual(["south-iceland", "taipei", "lisbon"]);
    expect(results.map((item) => item.rank)).toEqual([1, 2, 3]);
    // P = {nature: 5, city-life: 1}; south-iceland: 50 + 50 · (5 · 1 + 1 · -0.6) / 6
    expect(results[0]?.fit).toBeCloseTo(50 + (50 * 4.4) / 6, 10);
    expect(results[0]?.displayFit).toBe(87);
    expect(notices).toEqual(["fewer_than_requested"]);
  });

  it("excludes draft and archived destinations (inactive content)", () => {
    const slugs = rankDestinations(DATA, ANSWERS, {}, LIMITS).results.map((item) => item.slug);
    expect(slugs).not.toContain("da-nang");
    expect(slugs).not.toContain("old-town");
  });

  it("orders by coverage, then slug, without answers (A2)", () => {
    const { results, notices } = rankDestinations(DATA, [], {}, LIMITS);
    expect(results.map((item) => [item.slug, item.fit])).toEqual([
      ["lisbon", 50],
      ["taipei", 50],
      ["south-iceland", 50],
    ]);
    expect(notices).toContain("no_preference_signal");
  });

  it("breaks exact ties by slug (A5)", () => {
    const tied = content({
      attributes: attributes("food"),
      questions: [question("q", [option("yes", { food: 1 }), option("no", { food: -1 })])],
      destinations: [destination("b", { food: 4 }), destination("c", { food: 4 }), destination("a", { food: 4 })],
    });
    expect(rankDestinations(tied, [{ question: "q", options: ["yes"] }], {}, LIMITS).results.map((item) => item.slug)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is independent of input order (A6)", () => {
    const shuffled: DiagnosisContent = {
      attributes: [...DATA.attributes].reverse(),
      questions: [...DATA.questions].reverse().map((q) => ({
        ...q,
        options: [...q.options].reverse().map((o) => ({ ...o, effects: [...o.effects].reverse() })),
      })),
      destinations: [...DATA.destinations].reverse().map((d) => ({ ...d, attributeScores: [...d.attributeScores].reverse() })),
    };
    expect(rankDestinations(shuffled, ANSWERS, {}, LIMITS)).toEqual(rankDestinations(DATA, ANSWERS, {}, LIMITS));
  });

  it("returns resultCount results when enough destinations exist (F1)", () => {
    const many = content({
      ...DATA,
      destinations: Array.from({ length: 7 }, (_, index) => destination(`d${String(index)}`, { nature: index % 6 })),
    });
    expect(rankDestinations(many, ANSWERS, {}, LIMITS).results).toHaveLength(5);
    expect(rankDestinations(many, ANSWERS, {}, { ...LIMITS, resultCount: 3 }).results).toHaveLength(3);
    expect(rankDestinations(many, ANSWERS, {}, LIMITS).notices).toEqual([]);
  });

  it("handles no eligible destinations (F3)", () => {
    expect(rankDestinations(content({ ...DATA, destinations: [] }), ANSWERS, {}, LIMITS)).toMatchObject({
      results: [],
      notices: ["no_eligible_destinations"],
    });
  });

  it("excludes only over-budget destinations and keeps fit unchanged (D7)", () => {
    const priced = content({
      ...DATA,
      destinations: DATA.destinations.map((d) =>
        d.slug === "taipei"
          ? { ...d, costs: [estimate({ min: 300_000, max: 400_000 })] }
          : d.slug === "lisbon"
            ? { ...d, costs: [estimate({ currency: "EUR", min: 1, max: 2 })] }
            : d,
      ),
    });
    const budget = { amount: 200_000, currency: "JPY" } as const;
    const withBudget = rankDestinations(priced, ANSWERS, { budget }, LIMITS);
    const without = rankDestinations(priced, ANSWERS, {}, LIMITS);

    expect(withBudget.excluded).toEqual([{ slug: "taipei", reason: "over_budget" }]);
    expect(withBudget.results.map((item) => [item.slug, item.budget.status])).toEqual([
      ["south-iceland", "unknown"],
      ["lisbon", "incomparable"],
    ]);
    for (const item of withBudget.results) {
      expect(item.fit).toBe(without.results.find((other) => other.slug === item.slug)?.fit);
    }
    expect(withBudget.notices).toEqual(["fewer_than_requested"]);
  });

  it("annotates season and duration without changing the order (E2)", () => {
    const plain = rankDestinations(DATA, ANSWERS, {}, LIMITS);
    const annotated = rankDestinations(DATA, ANSWERS, { days: 4, months: [4] }, LIMITS);
    expect(annotated.results.map((item) => item.slug)).toEqual(plain.results.map((item) => item.slug));
    expect(annotated.results.map((item) => [item.slug, item.season, item.duration])).toEqual([
      ["south-iceland", "unknown", "shorter_than_recommended"],
      ["taipei", "unknown", "within_recommended"],
      ["lisbon", "in_season", "within_recommended"],
    ]);
  });

  it("explains results with the strongest positive contributions", () => {
    const [top] = rankDestinations(DATA, ANSWERS, {}, LIMITS).results;
    expect(top?.topAttributes).toEqual([{ attribute: "nature", value: 5 }]);
  });

  it("does not explain a result with an attribute the user does not want", () => {
    const data = content({
      attributes: attributes("adventure", "beach", "nature"),
      questions: [
        question("sea", [option("no-sea", { beach: -3 }), option("sea", { beach: 3 })]),
        question("style", [option("outdoors", { nature: 3, adventure: 2 }), option("indoors", { nature: -1 })], { category: "interests" }),
      ],
      destinations: [destination("cusco", { nature: 5, adventure: 5, beach: 0 }), destination("da-nang", { beach: 5, nature: 3 })],
    });
    const answers: Answer[] = [
      { question: "sea", options: ["no-sea"] },
      { question: "style", options: ["outdoors"] },
    ];
    const { results } = rankDestinations(data, answers, {}, LIMITS);
    const cusco = results.find((item) => item.slug === "cusco");
    // beach contributes -3 · -1 = 3 to fit, but an unwanted attribute is never a reason it fits.
    expect(cusco?.fit).toBeCloseTo(50 + (50 * (3 + 2 + 3)) / 8, 10);
    expect(cusco?.topAttributes.map((item) => item.attribute)).toEqual(["nature", "adventure"]);
  });

  it("reports ignored answers and still ranks", () => {
    const result = rankDestinations(DATA, [...ANSWERS, { question: "unknown", options: ["x"] }], {}, LIMITS);
    expect(result.ignoredAnswers).toEqual([{ question: "unknown", reason: "unknown_question" }]);
    expect(result.results).toHaveLength(3);
  });
});

describe("distinctiveStrengths", () => {
  // x = (2 · score − 5) / 5, so a contribution is P[a] · x.
  const x = (score: number) => (2 * score - 5) / 5;
  const card = (preferences: Record<string, number>, scores: Record<string, number>) =>
    Object.entries(scores).map(([attribute, score]) => ({ attribute, value: (preferences[attribute] ?? 0) * x(score) }));
  const P = { nature: 2, food: 1, beach: 1 };
  const preferences = new Map(Object.entries(P));

  it("names an attribute at least 0.75 points above the shown mean", () => {
    const shown = [
      card(P, { nature: 5, food: 4 }),
      card(P, { nature: 4, food: 4 }),
      card(P, { nature: 4, food: 4 }),
      card(P, { nature: 4, food: 4 }),
      card(P, { nature: 4, food: 4 }),
    ];
    const strengths = distinctiveStrengths(shown, preferences);
    // nature mean 4.2: 5 is 0.8 above it, 4 is below it.
    expect(strengths[0]).toEqual([{ attribute: "nature", value: expect.closeTo(2 * (x(5) - x(4.2)), 10) as number }]);
    expect(strengths.slice(1)).toEqual([[], [], [], []]);
  });

  it("names nothing below the margin, for identical results, or for one result", () => {
    expect(distinctiveStrengths([card(P, { nature: 5 }), card(P, { nature: 4 })], preferences)).toEqual([[], []]);
    expect(distinctiveStrengths([card(P, { nature: 5 }), card(P, { nature: 5 })], preferences)).toEqual([[], []]);
    expect(distinctiveStrengths([card(P, { nature: 5 })], preferences)).toEqual([[]]);
    expect(distinctiveStrengths([], preferences)).toEqual([]);
  });

  it("orders by weighted difference, ties by slug, and keeps at most two", () => {
    const shown = [card(P, { nature: 5, food: 5, beach: 5 }), card(P, { nature: 2, food: 2, beach: 2 })];
    // Differences are equal (1.5 points); nature weighs 2, food and beach tie at 1.
    expect(distinctiveStrengths(shown, preferences)[0]?.map((item) => item.attribute)).toEqual(["nature", "beach"]);
  });

  it("treats a missing score as neutral in the mean but never as a strength", () => {
    const shown = [card(P, { nature: 4 }), card(P, {}), card(P, {})];
    // nature mean x = (x(4) + 0 + 0) / 3, the same as a score of 2.5 + 1.5 / 3 = 3.
    expect(distinctiveStrengths(shown, preferences)).toEqual([
      [{ attribute: "nature", value: expect.closeTo(2 * (x(4) - x(4) / 3), 10) as number }],
      [],
      [],
    ]);
  });

  it("never names an attribute the user does not want", () => {
    const disliked = new Map([["beach", -2], ["nature", 1]]);
    const shown = [
      [{ attribute: "beach", value: -2 * x(0) }, { attribute: "nature", value: x(3) }],
      [{ attribute: "beach", value: -2 * x(5) }, { attribute: "nature", value: x(3) }],
    ];
    expect(distinctiveStrengths(shown, disliked)).toEqual([[], []]);
  });

  it("is attached to ranked results without changing fit or order", () => {
    const { results } = rankDestinations(DATA, ANSWERS, {}, LIMITS);
    expect(results.map((item) => item.slug)).toEqual(["south-iceland", "taipei", "lisbon"]);
    // P = {nature: 5, city-life: 1}; nature mean (5 + 3 + 2) / 3 ≈ 3.33, city-life mean (1 + 5 + 4) / 3 ≈ 3.33.
    expect(results.map((item) => item.strengths.map((strength) => strength.attribute))).toEqual([
      ["nature"],
      ["city-life"],
      [],
    ]);
  });
});
