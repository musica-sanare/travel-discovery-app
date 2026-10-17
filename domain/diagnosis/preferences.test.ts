import { describe, expect, it } from "vitest";
import { prepareContent } from "./content";
import { buildPreferences } from "./preferences";
import { attributes, content, option, question } from "./test-fixtures";

const MULTI = question(
  "multi",
  [option("a", { nature: 3, beach: 2 }), option("b", { nature: 1 }), option("c", { food: 3 }), option("old", { food: 5 }, "archived")],
  { type: "multiple_choice" },
);
const SINGLE = question("single", [option("a", { nature: 3, beach: 2 }), option("b", { food: 1 })]);

const usable = prepareContent(
  content({ attributes: [...attributes("beach", "food", "nature"), { slug: "retired", status: "archived" }], questions: [MULTI, SINGLE] }),
);

function p(answers: { question: string; options: string[] }[]) {
  return Object.fromEntries(buildPreferences(usable, answers).values);
}

describe("multiple_choice scoring", () => {
  it("averages over selected options, counting undefined effects as 0 (B1, B2)", () => {
    expect(p([{ question: "multi", options: ["a", "b"] }])).toEqual({ beach: 1, food: 0, nature: 2 });
    expect(p([{ question: "multi", options: ["a", "c"] }])).toEqual({ beach: 1, food: 1.5, nature: 1.5 });
  });

  it("equals the option's effects when one option is selected (B3)", () => {
    expect(p([{ question: "multi", options: ["a"] }])).toEqual(p([{ question: "single", options: ["a"] }]));
    expect(p([{ question: "multi", options: ["a"] }])).toEqual({ beach: 2, food: 0, nature: 3 });
  });

  it("deduplicates repeated selections (B4)", () => {
    expect(p([{ question: "multi", options: ["a", "a", "b"] }])).toEqual(p([{ question: "multi", options: ["a", "b"] }]));
  });

  it("ignores inactive options; only-inactive or empty selections count as skipped (B5)", () => {
    expect(p([{ question: "multi", options: ["a", "old"] }])).toEqual(p([{ question: "multi", options: ["a"] }]));
    const onlyInactive = buildPreferences(usable, [{ question: "multi", options: ["old"] }]);
    expect(onlyInactive.asked).toEqual(["multi"]);
    expect(onlyInactive.ignored).toEqual([{ question: "multi", reason: "no_valid_option" }]);
    expect(Object.fromEntries(onlyInactive.values)).toEqual({ beach: 0, food: 0, nature: 0 });
    const skipped = buildPreferences(usable, [{ question: "multi", options: [] }]);
    expect(skipped.asked).toEqual(["multi"]);
    expect(skipped.ignored).toEqual([]);
  });
});

describe("answer normalization", () => {
  it("sums contributions across questions", () => {
    expect(
      p([
        { question: "single", options: ["b"] },
        { question: "multi", options: ["a", "b"] },
      ]),
    ).toEqual({ beach: 1, food: 1, nature: 2 });
  });

  it("reports unknown, duplicate, and over-selected answers without throwing", () => {
    const result = buildPreferences(usable, [
      { question: "missing", options: ["a"] },
      { question: "single", options: ["a", "b"] },
      { question: "single", options: ["a"] },
    ]);
    expect(result.ignored).toEqual([
      { question: "missing", reason: "unknown_question" },
      { question: "single", reason: "too_many_options" },
      { question: "single", reason: "duplicate_question" },
    ]);
    expect(result.asked).toEqual(["single"]);
    expect(Object.fromEntries(result.values)).toEqual({ beach: 0, food: 0, nature: 0 });
  });

  it("ignores effects on inactive attributes", () => {
    const withRetired = prepareContent(
      content({
        attributes: [...attributes("food"), { slug: "retired", status: "archived" }],
        questions: [question("q", [option("x", { food: 2, retired: 5 }), option("y", { food: -1 })])],
      }),
    );
    expect(Object.fromEntries(buildPreferences(withRetired, [{ question: "q", options: ["x"] }]).values)).toEqual({ food: 2 });
  });
});
