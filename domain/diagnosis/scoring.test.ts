import { describe, expect, it } from "vitest";
import { centeredScore, scoreDestination } from "./scoring";
import { destination } from "./test-fixtures";

const ATTRIBUTES = ["beach", "food", "nature"];

function prefs(values: Record<string, number>): Map<string, number> {
  return new Map(ATTRIBUTES.map((attribute) => [attribute, values[attribute] ?? 0]));
}

describe("scoreDestination", () => {
  it("matches the documented example (A1)", () => {
    const p = prefs({ nature: 2, beach: 1 });
    expect(scoreDestination(destination("x", { nature: 5, beach: 1 }), ATTRIBUTES, p).fit).toBeCloseTo(73.3333, 4);
    expect(scoreDestination(destination("y", { nature: 2, beach: 5 }), ATTRIBUTES, p).fit).toBeCloseTo(60, 10);
  });

  it("returns the neutral fit without a preference signal", () => {
    expect(scoreDestination(destination("x", { nature: 5 }), ATTRIBUTES, prefs({})).fit).toBe(50);
  });

  it("treats a missing attribute score as neutral and lowers coverage (A3)", () => {
    const p = prefs({ nature: 2, beach: 1 });
    const partial = scoreDestination(destination("x", { nature: 5 }), ATTRIBUTES, p);
    expect(partial.fit).toBeCloseTo(50 + (50 * 2) / 3, 10);
    expect(partial.coverage).toBe(0.5);
    const none = scoreDestination(destination("y"), ATTRIBUTES, p);
    expect(none.fit).toBe(50);
    expect(none.coverage).toBe(0);
  });

  it("uses all usable attributes for coverage when there is no signal", () => {
    expect(scoreDestination(destination("x", { food: 3 }), ATTRIBUTES, prefs({})).coverage).toBeCloseTo(1 / 3, 10);
  });

  it("penalizes high scores for negative preferences", () => {
    const p = prefs({ beach: -3 });
    expect(scoreDestination(destination("x", { beach: 5 }), ATTRIBUTES, p).fit).toBe(0);
    expect(scoreDestination(destination("y", { beach: 0 }), ATTRIBUTES, p).fit).toBe(100);
  });

  it("keeps fit within [0, 100] (A7)", () => {
    for (const nature of [-5, -2.5, 0.5, 5]) {
      for (const beach of [-5, 0, 3]) {
        for (const score of [0, 1, 2, 3, 4, 5]) {
          const { fit } = scoreDestination(destination("x", { nature: score, beach: 5 - score }), ATTRIBUTES, prefs({ nature, beach }));
          expect(fit).toBeGreaterThanOrEqual(0);
          expect(fit).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("centers 0-5 scores on [-1, 1]", () => {
    expect([0, 1, 2, 3, 4, 5].map(centeredScore)).toEqual([-1, -0.6, -0.2, 0.2, 0.6, 1]);
  });
});
