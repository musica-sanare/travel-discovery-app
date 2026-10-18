import { describe, expect, it } from "vitest";
import { topPreferences } from "./summary";
import { attributes, content, option, question } from "./test-fixtures";

const CONTENT = content({
  attributes: [...attributes("beach", "food", "nature", "city"), { slug: "retired", status: "archived" }],
  questions: [
    question("q1", [option("a", { nature: 3, beach: 2, city: -2, retired: 5 }), option("b", { food: 1 })]),
    question("q2", [option("a", { food: 2 }), option("b", { beach: 1 })]),
  ],
});

describe("topPreferences", () => {
  it("returns positive preferences, strongest first, ties by slug", () => {
    const result = topPreferences(CONTENT, [{ question: "q1", options: ["a"] }, { question: "q2", options: ["a"] }], 5);
    expect(result).toEqual([
      { attribute: "nature", value: 3 },
      { attribute: "beach", value: 2 },
      { attribute: "food", value: 2 },
    ]);
  });

  it("limits the count and ignores negative, inactive, and unknown input", () => {
    const result = topPreferences(
      CONTENT,
      [{ question: "q1", options: ["a"] }, { question: "unknown", options: ["x"] }],
      1,
    );
    expect(result).toEqual([{ attribute: "nature", value: 3 }]);
  });

  it("is empty without a positive signal", () => {
    expect(topPreferences(CONTENT, [{ question: "q1", options: [] }], 5)).toEqual([]);
  });
});
