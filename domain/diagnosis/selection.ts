/**
 * Next-question selection and stopping rule (docs/en/DIAGNOSTIC_ALGORITHM.md §7, §8).
 */
import { compareSlugs, prepareContent, type UsableContent, type UsableQuestion } from "./content";
import { buildPreferences, signalStrength } from "./preferences";
import { stepRandom } from "./random";
import { compareByFit } from "./ranking";
import { centeredScore, scoreDestination } from "./scoring";
import type { Answer, DiagnosisContent, QuizLimits } from "./types";

export type StopReason = "target_reached" | "no_more_questions";

export type NextStep =
  | { done: false; question: string }
  | { done: true; reason: StopReason; insufficientQuestions: boolean };

export const NOVELTY_FACTOR = 2;

export function questionWeight(
  question: UsableQuestion,
  askedInCategory: number,
  preferences: ReadonlyMap<string, number>,
): number {
  const novel = question.attributes.some((attribute) => (preferences.get(attribute) ?? 0) === 0);
  return (question.priorityWeight / (1 + askedInCategory)) * (novel ? NOVELTY_FACTOR : 1);
}

/** Candidates in slug order with the priority, category, and novelty weight (without discrimination). */
export function candidateWeights(
  content: UsableContent,
  answers: readonly Answer[],
): { slug: string; weight: number }[] {
  const { values, asked } = buildPreferences(content, answers);
  const askedSet = new Set(asked);
  const perCategory = new Map<string, number>();
  for (const slug of asked) {
    const category = content.questions.get(slug)?.category;
    if (category !== undefined) {
      perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    }
  }
  return [...content.questions.values()]
    .filter((question) => !askedSet.has(question.slug))
    .sort((a, b) => compareSlugs(a.slug, b.slug))
    .map((question) => ({
      slug: question.slug,
      weight: questionWeight(question, perCategory.get(question.category) ?? 0, values),
    }));
}

/**
 * Destinations that discrimination is measured over: every usable destination
 * while there is no preference signal, otherwise the top `size` in ranking
 * order without trip constraints.
 */
export function discriminationPool(
  content: UsableContent,
  preferences: ReadonlyMap<string, number>,
  size: number,
): UsableContent["destinations"] {
  if (signalStrength(preferences) === 0) {
    return content.destinations;
  }
  return content.destinations
    .map((destination) => ({
      destination,
      slug: destination.slug,
      ...scoreDestination(destination, content.attributes, preferences),
    }))
    .sort(compareByFit)
    .slice(0, size)
    .map((item) => item.destination);
}

type CenteredScores = readonly ReadonlyMap<string, number>[];

function centeredScores(pool: UsableContent["destinations"]): CenteredScores {
  return pool.map(
    (destination) => new Map(destination.attributeScores.map((item) => [item.attribute, centeredScore(item.score)])),
  );
}

function meanOptionSpread(question: UsableQuestion, centered: CenteredScores): number {
  if (centered.length === 0 || question.options.size === 0) {
    return 0;
  }
  let total = 0;
  for (const effects of question.options.values()) {
    const values = centered.map((x) => {
      let value = 0;
      for (const [attribute, weight] of effects) {
        value += weight * (x.get(attribute) ?? 0);
      }
      return value;
    });
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    total += Math.sqrt(variance);
  }
  return total / question.options.size;
}

/** Mean over the options of the population standard deviation of Σ_a w_o[a] · x_d[a] over `pool`. */
export function discrimination(question: UsableQuestion, pool: UsableContent["destinations"]): number {
  return meanOptionSpread(question, centeredScores(pool));
}

/**
 * Candidates in slug order with their weights multiplied by discrimination over
 * the top `2 · resultCount` destinations; the plain weights if every
 * discrimination is 0.
 */
export function selectionWeights(
  content: UsableContent,
  answers: readonly Answer[],
  resultCount: number,
): { slug: string; weight: number }[] {
  const base = candidateWeights(content, answers);
  const centered = centeredScores(
    discriminationPool(content, buildPreferences(content, answers).values, 2 * resultCount),
  );
  const weighted = base.map((candidate) => {
    const question = content.questions.get(candidate.slug);
    return { slug: candidate.slug, weight: question ? candidate.weight * meanOptionSpread(question, centered) : 0 };
  });
  return weighted.some((candidate) => candidate.weight > 0) ? weighted : base;
}

/** Picks the candidate whose cumulative weight first exceeds r · total. */
export function drawWeighted(candidates: readonly { slug: string; weight: number }[], r: number): string | undefined {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) {
    return undefined;
  }
  const target = r * total;
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (target < cumulative) {
      return candidate.slug;
    }
  }
  return candidates[candidates.length - 1]?.slug;
}

/** Questions the quiz will ask if every usable question remains available (for progress display). */
export function plannedQuestionCount(content: DiagnosisContent, limits: QuizLimits): number {
  return Math.min(limits.targetQuestions, limits.maxQuestions, prepareContent(content).questions.size);
}

/**
 * @param limits validated quiz settings (min <= target <= max)
 * @param seed unsigned 32-bit session seed
 */
export function nextQuestion(
  content: DiagnosisContent,
  answers: readonly Answer[],
  limits: QuizLimits,
  seed: number,
): NextStep {
  const usable = prepareContent(content);
  const { asked } = buildPreferences(usable, answers);
  const limit = Math.min(limits.targetQuestions, limits.maxQuestions);
  if (asked.length >= limit) {
    return { done: true, reason: "target_reached", insufficientQuestions: false };
  }
  const question = drawWeighted(
    selectionWeights(usable, answers, limits.resultCount),
    stepRandom(seed, asked.length),
  );
  if (question === undefined) {
    return {
      done: true,
      reason: "no_more_questions",
      insufficientQuestions: asked.length < limits.minQuestions,
    };
  }
  return { done: false, question };
}
