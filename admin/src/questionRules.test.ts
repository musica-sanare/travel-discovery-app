import { describe, expect, it } from "vitest";
import { questionPublishIssues } from "./questionRules";

describe("questionPublishIssues", () => {
  it("blocks publishing multiple-choice questions", () => {
    expect(questionPublishIssues({ status: "published", type: "multiple_choice" })).toEqual([
      { path: "type", code: "question_type_not_publishable" },
    ]);
  });

  it.each([
    ["draft", "multiple_choice"],
    ["archived", "multiple_choice"],
    ["published", "single_choice"],
  ] as const)("allows status %s with type %s", (status, type) => {
    expect(questionPublishIssues({ status, type })).toEqual([]);
  });
});
