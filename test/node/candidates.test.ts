/**
 * The Phase 15 candidate rules (test/simulation/candidates.ts) are
 * deterministic and keep the documented bounds.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareContent } from "../../domain/diagnosis/content";
import type { Answer } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import {
  cappedPolicy,
  currentPolicy,
  discrimination,
  phase14Policy,
  discriminationPolicy,
  earlyStoppingPolicy,
  isStable,
} from "../simulation/candidates";
import { runQuiz } from "../simulation/quiz-quality";
import { toSimulationContent, type SelectionPolicy, type SimulationBundle } from "../simulation/quiz-variety";
import { makeRespondent } from "../simulation/respondents";

const content = toSimulationContent(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../../content/initial-v6.json"), "utf8"),
  ) as SimulationBundle,
);
const usable = prepareContent(content);
const limits = DEFAULT_QUIZ_SETTINGS;
const behaviour = { noise: 0.1, skipRate: 0.1 };
const quiz = (policy: SelectionPolicy, seed: number) =>
  runQuiz(content, usable, makeRespondent(usable, "sparse", 0, seed), behaviour, limits, policy, seed);

describe("discrimination", () => {
  it("is 0 over a single destination and positive over all of them", () => {
    const [first] = usable.destinations;
    expect(discrimination(usable, "by-the-sea", [first?.slug ?? ""])).toBe(0);
    expect(discrimination(usable, "by-the-sea", usable.destinations.map((d) => d.slug))).toBeGreaterThan(0);
  });
});

// Each test runs hundreds of complete quizzes; the default 5 s is too short when the whole suite runs in parallel.
describe("candidate policies", { timeout: 30_000 }, () => {
  const policies: [string, SelectionPolicy][] = [
    ["plain", discriminationPolicy({ mode: { kind: "plain" }, pool: "top" })],
    ["floor", discriminationPolicy({ mode: { kind: "floor", floor: 0.25 }, pool: "topOrAll" })],
    ["capped", discriminationPolicy({ mode: { kind: "capped", cap: 2 }, pool: "topOrAll" })],
    ["stop", earlyStoppingPolicy(currentPolicy, { gap: 3, window: 1, countSkips: false, cap: "max" })],
  ];

  it.each(policies)("%s gives the same quiz for the same seed and differs between seeds", (_, policy) => {
    expect(quiz(policy, 11)).toEqual(quiz(policy, 11));
    expect(quiz(policy, 11).map((a) => a.question)).not.toEqual(quiz(policy, 12).map((a) => a.question));
  });

  it("matches the app's rule with D-plain and differs from the Phase 14 rule", () => {
    const plain = discriminationPolicy({ mode: { kind: "plain" }, pool: "topOrAll" });
    let differs = 0;
    for (let seed = 0; seed < 20; seed++) {
      expect(quiz(currentPolicy, seed)).toEqual(quiz(plain, seed));
      if (JSON.stringify(quiz(phase14Policy, seed)) !== JSON.stringify(quiz(plain, seed))) differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });

  it("asks the target number of questions with discrimination alone", () => {
    for (let seed = 0; seed < 20; seed++) expect(quiz(policies[0]?.[1] ?? currentPolicy, seed)).toHaveLength(10);
  });

  it("stops early only after minQuestions and never beyond the cap", () => {
    const stop = earlyStoppingPolicy(currentPolicy, { gap: 0, window: 1, countSkips: true, cap: "max" });
    const full = cappedPolicy(currentPolicy, "max");
    for (let seed = 0; seed < 20; seed++) {
      const answers = quiz(stop, seed);
      expect(answers.length).toBeGreaterThanOrEqual(limits.minQuestions);
      expect(answers.length).toBeLessThanOrEqual(limits.maxQuestions);
      expect(quiz(full, seed)).toHaveLength(limits.maxQuestions);
    }
  });
});

describe("isStable", () => {
  const answers = quiz(currentPolicy, 5);
  const loose = { gap: 0, window: 1, countSkips: true };

  it("is false before minQuestions answers", () => {
    expect(isStable(content, answers.slice(0, limits.minQuestions - 1), limits, loose)).toBe(false);
  });

  it("is false when the gap threshold cannot be met", () => {
    expect(isStable(content, answers, limits, { ...loose, gap: 101 })).toBe(false);
  });

  it("counts a trailing skip as an unchanged answer only when skips count", () => {
    const respondent = makeRespondent(usable, "sparse", 0, 5);
    const answered = runQuiz(content, usable, respondent, { noise: 0, skipRate: 0 }, limits, currentPolicy, 5);
    const unasked = [...usable.questions.keys()].find((slug) => !answered.some((a) => a.question === slug));
    const withSkip: Answer[] = [...answered.slice(0, limits.minQuestions), { question: unasked ?? "", options: [] }];
    expect(isStable(content, withSkip, limits, loose)).toBe(true);
    expect(isStable(content, withSkip, limits, { ...loose, countSkips: false })).toBe(
      isStable(content, withSkip.slice(0, -1), limits, { ...loose, countSkips: false }),
    );
  });
});
