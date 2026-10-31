/**
 * The quiz-quality evaluation (test/simulation/quiz-quality.ts) is
 * deterministic, and its respondents answer consistently with their profile.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nextQuestion } from "../../domain/diagnosis";
import { prepareContent } from "../../domain/diagnosis/content";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { evaluateQuizQuality, idealRanking, type QualityOptions } from "../simulation/quiz-quality";
import { toSimulationContent, type SimulationBundle } from "../simulation/quiz-variety";
import { makeRespondent, respondentAnswer, sparseProfile } from "../simulation/respondents";

const content = toSimulationContent(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../../content/initial-v6.json"), "utf8"),
  ) as SimulationBundle,
);
const usable = prepareContent(content);
const options: QualityOptions = {
  respondents: 100,
  masterSeed: 1,
  family: "sparse",
  behaviour: { noise: 0.1, skipRate: 0.1 },
  limits: DEFAULT_QUIZ_SETTINGS,
  policy: nextQuestion,
};

// Each test runs hundreds of complete quizzes; the default 5 s is too short when the whole suite runs in parallel.
describe("evaluateQuizQuality", { timeout: 30_000 }, () => {
  it("returns the same report for the same options", () => {
    expect(evaluateQuizQuality(content, options)).toEqual(evaluateQuizQuality(content, options));
  });

  it("changes with the master seed", () => {
    expect(evaluateQuizQuality(content, { ...options, masterSeed: 2 })).not.toEqual(
      evaluateQuizQuality(content, options),
    );
  });

  it("asks the target number of questions and agrees with itself as the full-length reference", () => {
    const report = evaluateQuizQuality(content, options);
    expect(report.questionCounts).toEqual({ [DEFAULT_QUIZ_SETTINGS.targetQuestions]: options.respondents });
    expect(report.meanReferenceOverlap).toBe(DEFAULT_QUIZ_SETTINGS.resultCount);
    expect(report.sameAsReference).toBe(1);
    expect(report.meanFitLoss).toBeGreaterThanOrEqual(0);
  });

  it("finds the ideal top results when noiseless respondents answer every question", () => {
    const report = evaluateQuizQuality(content, { ...options, behaviour: { noise: 0, skipRate: 0 } });
    expect(report.meanAllQuestionsOverlap).toBeGreaterThan(report.meanIdealOverlap * 0.9);
    expect(report.meanIdealOverlap).toBeGreaterThan(0);
  });

  it("gives every anchored respondent's anchor a high ideal rank", () => {
    for (let index = 0; index < usable.destinations.length; index++) {
      const respondent = makeRespondent(usable, "anchored", index, 1000 + index);
      const ideal = idealRanking(usable, respondent.profile).map((item) => item.slug);
      expect(ideal.indexOf(respondent.anchor ?? "")).toBeLessThan(DEFAULT_QUIZ_SETTINGS.resultCount);
    }
  });
});

describe("simulated respondents", () => {
  it("build sparse profiles with 2-4 liked and 0-2 disliked attributes", () => {
    for (let seed = 0; seed < 50; seed++) {
      const values = [...sparseProfile(usable.attributes, seed).values()];
      const liked = values.filter((value) => value > 0);
      const disliked = values.filter((value) => value < 0);
      expect(liked.length).toBeGreaterThanOrEqual(2);
      expect(liked.length).toBeLessThanOrEqual(4);
      expect(disliked.length).toBeLessThanOrEqual(2);
      expect(liked.every((value) => value >= 3 && value <= 5)).toBe(true);
      expect(disliked.every((value) => value >= -4 && value <= -2)).toBe(true);
    }
  });

  it("answer a question the same way wherever it is asked", () => {
    const respondent = makeRespondent(usable, "sparse", 0, 42);
    for (const question of usable.questions.values()) {
      const behaviour = { noise: 0.5, skipRate: 0.2 };
      expect(respondentAnswer(respondent, question, behaviour)).toEqual(
        respondentAnswer(respondent, question, behaviour),
      );
    }
  });

  it("pick the option whose effects best match the profile without noise", () => {
    const respondent = { seed: 7, profile: new Map(usable.attributes.map((a) => [a, a === "beach" ? 5 : 0])) };
    const question = usable.questions.get("by-the-sea");
    if (question === undefined) throw new Error("missing question by-the-sea");
    const [answer] = respondentAnswer(respondent, question, { noise: 0, skipRate: 0 });
    const beachWeight = (value: string) => question.options.get(value)?.get("beach") ?? 0;
    const best = Math.max(...[...question.options.keys()].map(beachWeight));
    expect(beachWeight(answer ?? "")).toBe(best);
  });
});
