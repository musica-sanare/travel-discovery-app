/**
 * Next-question selection and stopping rule (docs/DIAGNOSTIC_ALGORITHM.md §7, §8).
 */
import { compareSlugs, prepareContent, type UsableContent, type UsableQuestion } from "./content";
import { buildPreferences } from "./preferences";
import { stepRandom } from "./random";
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

/** Candidates in slug order with their weights. */
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
  const question = drawWeighted(candidateWeights(usable, answers), stepRandom(seed, asked.length));
  if (question === undefined) {
    return {
      done: true,
      reason: "no_more_questions",
      insufficientQuestions: asked.length < limits.minQuestions,
    };
  }
  return { done: false, question };
}
