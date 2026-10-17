import { describe, expect, it } from "vitest";
import { prepareContent } from "./content";
import { mulberry32, stepRandom } from "./random";
import { drawWeighted, nextQuestion, plannedQuestionCount, questionWeight } from "./selection";
import { LIMITS, attributes, content, option, question } from "./test-fixtures";
import type { Answer, DiagnosisContent, QuizLimits } from "./types";

const ATTRS = ["a1", "a2", "a3", "a4", "a5", "a6"];

/** `count` questions spread over `categories`, each touching two attributes. */
function pool(count: number, categories = ["c1", "c2", "c3"]): DiagnosisContent {
  return content({
    attributes: attributes(...ATTRS),
    questions: Array.from({ length: count }, (_, index) => {
      const first = ATTRS[index % ATTRS.length] ?? "a1";
      const second = ATTRS[(index + 1) % ATTRS.length] ?? "a2";
      return question(
        `q${String(index).padStart(2, "0")}`,
        [option("yes", { [first]: 2, [second]: 1 }), option("no", { [first]: -2 })],
        { category: categories[index % categories.length] ?? "c1" },
      );
    }),
  });
}

/** Runs a quiz answering "yes" until the engine stops. */
function run(data: DiagnosisContent, limits: QuizLimits, seed: number) {
  const answers: Answer[] = [];
  for (let guard = 0; guard < 100; guard += 1) {
    const step = nextQuestion(data, answers, limits, seed);
    if (step.done) {
      return { asked: answers.map((answer) => answer.question), step };
    }
    answers.push({ question: step.question, options: ["yes"] });
  }
  throw new Error("quiz did not stop");
}

describe("nextQuestion", () => {
  it("never repeats a question (C1)", () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const { asked } = run(pool(15), LIMITS, seed);
      expect(new Set(asked).size).toBe(asked.length);
    }
  });

  it("stops at the target and never exceeds the maximum (C2)", () => {
    expect(run(pool(15), LIMITS, 7)).toMatchObject({ asked: { length: 10 }, step: { reason: "target_reached" } });
    expect(run(pool(15), { ...LIMITS, targetQuestions: 12 }, 7).asked).toHaveLength(12);
    expect(run(pool(15), { ...LIMITS, minQuestions: 3, targetQuestions: 6, maxQuestions: 6 }, 7).asked).toHaveLength(6);
    // Defensive: an unvalidated target above the maximum is capped.
    expect(run(pool(15), { ...LIMITS, targetQuestions: 14, maxQuestions: 12 }, 7).asked).toHaveLength(12);
  });

  it("asks fewer questions when content runs out and flags it below the minimum (C3)", () => {
    expect(run(pool(3), LIMITS, 1)).toEqual({
      asked: expect.any(Array) as unknown,
      step: { done: true, reason: "no_more_questions", insufficientQuestions: true },
    });
    expect(run(pool(3), LIMITS, 1).asked).toHaveLength(3);
    expect(run(pool(7), LIMITS, 1)).toMatchObject({
      asked: { length: 7 },
      step: { reason: "no_more_questions", insufficientQuestions: false },
    });
    expect(nextQuestion(content({}), [], LIMITS, 1)).toEqual({
      done: true,
      reason: "no_more_questions",
      insufficientQuestions: true,
    });
  });

  it("reports the planned question count for progress", () => {
    expect(plannedQuestionCount(pool(15), LIMITS)).toBe(10);
    expect(plannedQuestionCount(pool(4), LIMITS)).toBe(4);
  });

  it("counts skipped answers as asked", () => {
    const first = nextQuestion(pool(5), [], LIMITS, 3);
    if (first.done) throw new Error("expected a question");
    const second = nextQuestion(pool(5), [{ question: first.question, options: [] }], LIMITS, 3);
    expect(second).not.toEqual(first);
  });

  it("reproduces the same sequence for the same seed (C6)", () => {
    expect(run(pool(15), LIMITS, 12345)).toEqual(run(pool(15), LIMITS, 12345));
  });

  it("is independent of the order of questions in the content", () => {
    const data = pool(15);
    const reversed = { ...data, questions: [...data.questions].reverse() };
    expect(run(reversed, LIMITS, 99)).toEqual(run(data, LIMITS, 99));
  });

  it("varies the question set across seeds (C7)", () => {
    const sequences = new Set(Array.from({ length: 10 }, (_, seed) => run(pool(15), LIMITS, seed).asked.join(",")));
    expect(sequences.size).toBeGreaterThan(1);
  });

  it("skips unusable questions (C8)", () => {
    const data = content({
      attributes: attributes("a1"),
      questions: [
        question("draft", [option("x", { a1: 1 }), option("y")], { status: "draft" }),
        question("archived", [option("x", { a1: 1 }), option("y")], { status: "archived" }),
        question("inactive-category", [option("x", { a1: 1 }), option("y")], { categoryStatus: "archived" }),
        question("one-option", [option("x", { a1: 1 }), option("y", {}, "archived")]),
        question("no-effects", [option("x"), option("y")]),
        question("usable", [option("x", { a1: 1 }), option("y")]),
      ],
    });
    expect(prepareContent(data).questionsWithoutEffects).toEqual(["no-effects"]);
    expect(nextQuestion(data, [], LIMITS, 5)).toEqual({ done: false, question: "usable" });
    expect(nextQuestion(data, [{ question: "usable", options: ["x"] }], LIMITS, 5)).toMatchObject({
      done: true,
      reason: "no_more_questions",
    });
  });

  it("tends to alternate categories (C4)", () => {
    const data = pool(12, ["c1", "c2"]);
    let alternated = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const { asked } = run(data, { ...LIMITS, minQuestions: 1, targetQuestions: 2, maxQuestions: 2 }, seed);
      const [first, second] = asked.map((slug) => data.questions.find((q) => q.slug === slug)?.category);
      if (first !== second) alternated += 1;
    }
    // Expected about 70% (6 / (6 + 5 · 0.5)); unbalanced selection would give about 50%.
    expect(alternated).toBeGreaterThan(120);
  });
});

describe("questionWeight", () => {
  const usable = prepareContent(
    content({
      attributes: attributes("a1", "a2"),
      questions: [question("q", [option("x", { a1: 1 }), option("y", { a2: 1 })], { priorityWeight: 6 })],
    }),
  );
  const q = usable.questions.get("q");
  if (!q) throw new Error("fixture");

  it("divides priority by 1 + questions already asked in the category (C4)", () => {
    const signalled = new Map([["a1", 1], ["a2", -1]]);
    expect(questionWeight(q, 0, signalled)).toBe(6);
    expect(questionWeight(q, 2, signalled)).toBe(2);
  });

  it("doubles the weight when the question touches an attribute without signal (C5)", () => {
    expect(questionWeight(q, 0, new Map([["a1", 1], ["a2", 0]]))).toBe(12);
    expect(questionWeight(q, 1, new Map())).toBe(6);
  });
});

describe("seeded randomness", () => {
  it("derives a reproducible number in [0, 1) per step", () => {
    for (const seed of [0, 1, 2 ** 31, 0xffffffff]) {
      for (let step = 0; step < 20; step += 1) {
        const value = stepRandom(seed, step);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        expect(stepRandom(seed, step)).toBe(value);
      }
    }
    expect(stepRandom(1, 0)).not.toBe(stepRandom(1, 1));
    expect(stepRandom(1, 0)).not.toBe(stepRandom(2, 0));
    expect(mulberry32(0)).toBe(mulberry32(0));
  });

  it("draws proportionally to weight", () => {
    const candidates = [
      { slug: "a", weight: 1 },
      { slug: "b", weight: 0 },
      { slug: "c", weight: 3 },
    ];
    expect(drawWeighted(candidates, 0)).toBe("a");
    expect(drawWeighted(candidates, 0.2499)).toBe("a");
    expect(drawWeighted(candidates, 0.25)).toBe("c");
    expect(drawWeighted(candidates, 0.9999)).toBe("c");
    expect(drawWeighted([], 0.5)).toBeUndefined();
    expect(drawWeighted([{ slug: "z", weight: 0 }], 0.5)).toBeUndefined();
  });
});
