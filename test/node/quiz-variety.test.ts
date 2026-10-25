/**
 * The quiz-variety simulation (test/simulation/quiz-variety.ts) is
 * deterministic and measures what it reports.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { simulateQuizzes, toSimulationContent, type SimulationBundle } from "../simulation/quiz-variety";

const bundle = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../content/initial-v4.json"), "utf8"),
) as SimulationBundle;
const content = toSimulationContent(bundle);
const options = { runs: 200, masterSeed: 1, skipRate: 0, limits: DEFAULT_QUIZ_SETTINGS };

describe("simulateQuizzes", () => {
  it("returns the same report for the same options", () => {
    expect(simulateQuizzes(content, options)).toEqual(simulateQuizzes(content, options));
  });

  it("changes with the master seed", () => {
    expect(simulateQuizzes(content, { ...options, masterSeed: 2 })).not.toEqual(simulateQuizzes(content, options));
  });

  it("asks the target number of questions in every session", () => {
    const report = simulateQuizzes(content, options);
    const shownTotal = Object.values(report.questionShownShare).reduce((sum, share) => sum + share, 0);
    expect(shownTotal).toBeCloseTo(DEFAULT_QUIZ_SETTINGS.targetQuestions);
    // Any two 10-question sets drawn from 12 questions share at least 8.
    expect(report.meanSharedQuestions).toBeGreaterThanOrEqual(8);
    expect(report.meanSharedQuestions).toBeLessThanOrEqual(DEFAULT_QUIZ_SETTINGS.targetQuestions);
  });

  it("counts every published destination once per session in the top results", () => {
    const report = simulateQuizzes(content, options);
    const topTotal = Object.values(report.topResultShare).reduce((sum, share) => sum + share, 0);
    expect(topTotal).toBeCloseTo(DEFAULT_QUIZ_SETTINGS.resultCount);
    expect(Object.keys(report.topResultShare)).toHaveLength(bundle.destinations.length);
  });

  it("ignores skipped answers in the preferences but still counts them as shown", () => {
    const report = simulateQuizzes(content, { ...options, skipRate: 1 });
    const shownTotal = Object.values(report.questionShownShare).reduce((sum, share) => sum + share, 0);
    expect(shownTotal).toBeCloseTo(DEFAULT_QUIZ_SETTINGS.targetQuestions);
    // No preference signal: every session ranks by slug, so exactly resultCount destinations ever appear.
    expect(Object.values(report.topResultShare).filter((share) => share > 0)).toHaveLength(
      DEFAULT_QUIZ_SETTINGS.resultCount,
    );
  });
});
