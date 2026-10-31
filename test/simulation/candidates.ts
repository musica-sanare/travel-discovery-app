/**
 * Candidate selection and stopping rules for Phase 15 task 3
 * (prompts/15-question-selection-and-early-stopping.md), evaluated in
 * simulation only. Each candidate is a pure function of content, answers,
 * settings, and seed with the signature of `nextQuestion`; nothing here is
 * used by the app. `D-plain` (`discriminationPolicy` with the plain mode and the
 * `topOrAll` pool) was adopted in `domain/diagnosis/selection.ts`; the
 * comparison now uses `phase14Policy` as its baseline.
 */
import { prepareContent, type UsableContent } from "../../domain/diagnosis/content";
import { buildPreferences, signalStrength } from "../../domain/diagnosis/preferences";
import { stepRandom } from "../../domain/diagnosis/random";
import { centeredScore } from "../../domain/diagnosis/scoring";
import { candidateWeights, drawWeighted } from "../../domain/diagnosis/selection";
import { nextQuestion, rankDestinations, type Answer, type DiagnosisContent, type QuizLimits } from "../../domain/diagnosis";
import type { SelectionPolicy } from "./quiz-variety";

/**
 * How discrimination changes a candidate's weight:
 * - `plain`: weight · d (DIAGNOSTIC_ALGORITHM.md §8);
 * - `floor`: weight · max(d, floor · mean d), so no question becomes impossible;
 * - `capped`: weight · clamp(d / mean d, 1 / cap, cap), which also bounds how much d can favour a question.
 */
export type DiscriminationMode =
  | { kind: "plain" }
  | { kind: "floor"; floor: number }
  | { kind: "capped"; cap: number };

export interface DiscriminationOptions {
  mode: DiscriminationMode;
  /**
   * `top`: the current top 2 · resultCount destinations, as in §8, even with no
   * signal (then they are the first in slug order). `topOrAll`: every destination
   * while there is no preference signal, the top 2 · resultCount after that.
   */
  pool: "top" | "topOrAll";
}

/** Population standard deviation of Σ_a w_o[a] · x_d[a] over the pool, averaged over the options. */
export function discrimination(
  content: UsableContent,
  question: string,
  pool: readonly string[],
): number {
  const options = content.questions.get(question)?.options;
  if (options === undefined || options.size === 0 || pool.length === 0) return 0;
  const centered = new Map(
    content.destinations
      .filter((destination) => pool.includes(destination.slug))
      .map((destination) => [
        destination.slug,
        new Map(destination.attributeScores.map((item) => [item.attribute, centeredScore(item.score)])),
      ]),
  );
  let total = 0;
  for (const effects of options.values()) {
    const values = pool.map((slug) => {
      const x = centered.get(slug);
      let value = 0;
      for (const [attribute, weight] of effects) value += weight * (x?.get(attribute) ?? 0);
      return value;
    });
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    total += Math.sqrt(variance);
  }
  return total / options.size;
}

function discriminationPool(
  content: DiagnosisContent,
  usable: UsableContent,
  answers: readonly Answer[],
  limits: QuizLimits,
  pool: DiscriminationOptions["pool"],
): string[] {
  if (pool === "topOrAll" && signalStrength(buildPreferences(usable, answers).values) === 0) {
    return usable.destinations.map((destination) => destination.slug);
  }
  return rankDestinations(content, answers, {}, { ...limits, resultCount: 2 * limits.resultCount }).results.map(
    (result) => result.slug,
  );
}

/** The current rule with each candidate's weight multiplied by its discrimination (§8 candidate and variants). */
export function discriminationPolicy(options: DiscriminationOptions): SelectionPolicy {
  return (content, answers, limits, seed) => {
    const usable = prepareContent(content);
    const { asked } = buildPreferences(usable, answers);
    if (asked.length >= Math.min(limits.targetQuestions, limits.maxQuestions)) {
      return { done: true, reason: "target_reached", insufficientQuestions: false };
    }
    const base = candidateWeights(usable, answers);
    const pool = discriminationPool(content, usable, answers, limits, options.pool);
    const scored = base.map((candidate) => ({ ...candidate, d: discrimination(usable, candidate.slug, pool) }));
    const meanD = scored.reduce((sum, item) => sum + item.d, 0) / Math.max(scored.length, 1);
    const factor = (d: number) => {
      const { mode } = options;
      if (mode.kind === "plain") return d;
      if (mode.kind === "floor") return Math.max(d, mode.floor * meanD);
      return meanD === 0 ? 1 : Math.min(mode.cap, Math.max(1 / mode.cap, d / meanD));
    };
    const weighted = scored.map(({ slug, weight, d }) => ({ slug, weight: weight * factor(d) }));
    // With every discrimination 0 the plain rule would ask nothing; fall back to the current weights.
    const candidates = weighted.some((item) => item.weight > 0) ? weighted : base;
    const question = drawWeighted(candidates, stepRandom(seed, asked.length));
    if (question === undefined) {
      return { done: true, reason: "no_more_questions", insufficientQuestions: asked.length < limits.minQuestions };
    }
    return { done: false, question };
  };
}

export interface StabilityOptions {
  /** Minimum fit gap between ranks resultCount and resultCount + 1, in fit points. */
  gap: number;
  /** Number of last counted answers that must leave the top set unchanged. */
  window: number;
  /** Whether a skipped answer counts toward the window (it never changes the ranking). */
  countSkips: boolean;
  /** Hard cap: `target` = min(targetQuestions, maxQuestions) as today, `max` = maxQuestions. */
  cap: "target" | "max";
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((slug) => b.includes(slug));

/** Whether the stability rule of §8 (with the given thresholds) says the quiz can stop after `answers`. */
export function isStable(
  content: DiagnosisContent,
  answers: readonly Answer[],
  limits: QuizLimits,
  options: Pick<StabilityOptions, "gap" | "window" | "countSkips">,
): boolean {
  const usable = prepareContent(content);
  if (buildPreferences(usable, answers).asked.length < limits.minQuestions) return false;
  const counted = answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => options.countSkips || answer.options.length > 0);
  if (counted.length < options.window) return false;
  const top = (prefix: readonly Answer[]) =>
    rankDestinations(content, prefix, {}, limits).results.map((result) => result.slug);
  const current = rankDestinations(content, answers, {}, { ...limits, resultCount: limits.resultCount + 1 }).results;
  const last = current[limits.resultCount - 1];
  const next = current[limits.resultCount];
  if (last === undefined || next === undefined || last.fit - next.fit < options.gap) return false;
  const currentTop = current.slice(0, limits.resultCount).map((result) => result.slug);
  for (const { index } of counted.slice(-options.window)) {
    if (!sameSet(top(answers.slice(0, index)), currentTop)) return false;
  }
  return true;
}

/** Wraps a selection rule with the stability stop; the hard cap follows `options.cap`. */
export function earlyStoppingPolicy(inner: SelectionPolicy, options: StabilityOptions): SelectionPolicy {
  return (content, answers, limits, seed) => {
    const capped = cappedLimits(limits, options.cap);
    if (isStable(content, answers, limits, options)) {
      return { done: true, reason: "target_reached", insufficientQuestions: false };
    }
    return inner(content, answers, capped, seed);
  };
}

/** The same rule without the stability stop, up to the same cap: the full-length reference. */
export function cappedPolicy(inner: SelectionPolicy, cap: StabilityOptions["cap"]): SelectionPolicy {
  return (content, answers, limits, seed) => inner(content, answers, cappedLimits(limits, cap), seed);
}

function cappedLimits(limits: QuizLimits, cap: StabilityOptions["cap"]): QuizLimits {
  return cap === "max" ? { ...limits, targetQuestions: limits.maxQuestions } : limits;
}

/** The rule in the app (discrimination-weighted since Phase 15). */
export const currentPolicy: SelectionPolicy = nextQuestion;

/** The rule before Phase 15: priority, category balance, and novelty only, kept to reproduce the comparison. */
export const phase14Policy: SelectionPolicy = (content, answers, limits, seed) => {
  const usable = prepareContent(content);
  const { asked } = buildPreferences(usable, answers);
  if (asked.length >= Math.min(limits.targetQuestions, limits.maxQuestions)) {
    return { done: true, reason: "target_reached", insufficientQuestions: false };
  }
  const question = drawWeighted(candidateWeights(usable, answers), stepRandom(seed, asked.length));
  if (question === undefined) {
    return { done: true, reason: "no_more_questions", insufficientQuestions: asked.length < limits.minQuestions };
  }
  return { done: false, question };
};
