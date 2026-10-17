import { describe, expect, it } from "vitest";
import { compareBudget } from "./budget";
import { destination, estimate } from "./test-fixtures";

const JPY_150K = { amount: 150_000, currency: "JPY" } as const;

describe("compareBudget", () => {
  it("is not applicable without a budget", () => {
    expect(compareBudget(destination("x", {}, { costs: [estimate()] }), undefined, 5).status).toBe("not_applicable");
  });

  it("is unknown without estimates", () => {
    expect(compareBudget(destination("x"), JPY_150K, 5).status).toBe("unknown");
  });

  it("classifies per-trip ranges as within, partial, or over (D1)", () => {
    const status = (min: number, max: number) =>
      compareBudget(destination("x", {}, { costs: [estimate({ min, max })] }), JPY_150K, undefined).status;
    expect(status(80_000, 150_000)).toBe("within");
    expect(status(100_000, 200_000)).toBe("partial");
    expect(status(150_001, 200_000)).toBe("over");
  });

  it("does not treat a lower bound equal to the budget as over (D6)", () => {
    expect(compareBudget(destination("x", {}, { costs: [estimate({ min: 150_000, max: 180_000 })] }), JPY_150K, undefined).status).toBe("partial");
  });

  it("scales per-day estimates by the trip length (D2)", () => {
    const result = compareBudget(
      destination("x", {}, { costs: [estimate({ period: "per_day", min: 20_000, max: 30_000 })] }),
      JPY_150K,
      5,
    );
    expect(result).toEqual({
      status: "within",
      estimate: { currency: "JPY", period: "per_day", tripMin: 100_000, tripMax: 150_000 },
    });
  });

  it("uses the shortest recommended stay for the lower bound without trip days (D2)", () => {
    const place = destination("x", {}, {
      recommendedDays: { min: 3, max: 10 },
      costs: [estimate({ period: "per_day", min: 40_000, max: 60_000 })],
    });
    expect(compareBudget(place, JPY_150K, undefined)).toEqual({
      status: "partial",
      estimate: { currency: "JPY", period: "per_day", tripMin: 120_000, tripMax: 600_000 },
    });
    // Would be "over" if the longest stay were used for exclusion.
    expect(compareBudget(place, JPY_150K, 10).status).toBe("over");
  });

  it("excludes a per-day estimate without trip days only when the shortest stay exceeds the budget (D6)", () => {
    const place = (perDayMin: number) =>
      destination("x", {}, {
        recommendedDays: { min: 3, max: 10 },
        costs: [estimate({ period: "per_day", min: perDayMin, max: 60_000 })],
      });
    // 50,000 x 3 days = 150,000 equals the budget: kept.
    expect(compareBudget(place(50_000), JPY_150K, undefined).status).toBe("partial");
    // 50,001 x 3 days = 150,003 exceeds the budget even for the shortest stay.
    expect(compareBudget(place(50_001), JPY_150K, undefined).status).toBe("over");
  });

  it("is within budget without trip days only when the longest stay fits", () => {
    const place = destination("x", {}, {
      recommendedDays: { min: 3, max: 5 },
      costs: [estimate({ period: "per_day", min: 20_000, max: 30_000 })],
    });
    expect(compareBudget(place, JPY_150K, undefined).status).toBe("within");
    expect(compareBudget(place, { amount: 149_999, currency: "JPY" }, undefined).status).toBe("partial");
  });

  it("is unknown when a per-day estimate cannot be scaled (D3)", () => {
    const perDay = [estimate({ period: "per_day", min: 1, max: 2 })];
    expect(compareBudget(destination("x", {}, { costs: perDay }), JPY_150K, undefined).status).toBe("unknown");
    expect(
      compareBudget(destination("y", {}, { costs: perDay, recommendedDays: { min: 3, max: null } }), JPY_150K, undefined).status,
    ).toBe("unknown");
  });

  it("never compares across currencies (D4)", () => {
    const usdOnly = destination("x", {}, { costs: [estimate({ currency: "USD", min: 1, max: 2 })] });
    expect(compareBudget(usdOnly, JPY_150K, 5).status).toBe("incomparable");
  });

  it("only compares estimates that exclude international flights (D5)", () => {
    const withFlights = destination("x", {}, {
      costs: [estimate({ scope: "per_person_including_international_flights", min: 1, max: 2 })],
    });
    expect(compareBudget(withFlights, JPY_150K, 5).status).toBe("incomparable");
  });

  it("selects the estimate in the budget currency (D8)", () => {
    const place = destination("x", {}, {
      costs: [estimate({ currency: "EUR", min: 900, max: 1_200 }), estimate({ currency: "JPY", min: 100_000, max: 140_000 })],
    });
    expect(compareBudget(place, JPY_150K, undefined).estimate?.currency).toBe("JPY");
    expect(compareBudget(place, { amount: 1_000, currency: "EUR" }, undefined).status).toBe("partial");
    expect(compareBudget(place, { amount: 1_000, currency: "USD" }, undefined).status).toBe("incomparable");
  });
});
