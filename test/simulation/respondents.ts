/**
 * Simulated respondents for the quiz-quality evaluation
 * (prompts/15-question-selection-and-early-stopping.md task 2). Each respondent
 * has a hidden preference profile H over the usable attributes and answers
 * consistently with it, with a stated rate of noise and skips. Node only; the
 * same seed always gives the same respondent and the same answers.
 */
import type { UsableContent, UsableQuestion } from "../../domain/diagnosis/content";
import { mulberry32 } from "../../domain/diagnosis/random";
import { centeredScore } from "../../domain/diagnosis/scoring";
import { randomStream } from "./quiz-variety";

export type ProfileFamily = "sparse" | "anchored";

export interface Respondent {
  seed: number;
  /** H[a] for every usable attribute (0 when indifferent). */
  profile: ReadonlyMap<string, number>;
  /** Destination the profile was built from (anchored family only). */
  anchor?: string;
}

export interface AnswerBehaviour {
  /** Probability of answering a shown question with a random option instead of the preferred one, 0-1. */
  noise: number;
  /** Probability of skipping a shown question, 0-1. */
  skipRate: number;
}

const integerBetween = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/** 2-4 liked attributes (+3..+5), 0-2 disliked ones (-2..-4), the rest 0. */
export function sparseProfile(attributes: readonly string[], seed: number): Map<string, number> {
  const random = randomStream(seed);
  const profile = new Map(attributes.map((attribute) => [attribute, 0]));
  const liked = integerBetween(random, 2, 4);
  const disliked = integerBetween(random, 0, 2);
  const order = shuffled(attributes, random);
  for (const attribute of order.slice(0, liked)) profile.set(attribute, integerBetween(random, 3, 5));
  for (const attribute of order.slice(liked, liked + disliked)) profile.set(attribute, -integerBetween(random, 2, 4));
  return profile;
}

/** 5 · x_d[a] plus uniform noise in [-1, 1]: someone whose ideal is close to destination d. */
export function anchoredProfile(
  content: UsableContent,
  destinationSlug: string,
  seed: number,
): Map<string, number> {
  const destination = content.destinations.find((item) => item.slug === destinationSlug);
  if (destination === undefined) throw new Error(`unknown destination ${destinationSlug}`);
  const scores = new Map(destination.attributeScores.map((item) => [item.attribute, item.score]));
  const random = randomStream(seed);
  return new Map(
    content.attributes.map((attribute) => {
      const score = scores.get(attribute);
      return [attribute, (score === undefined ? 0 : 5 * centeredScore(score)) + (2 * random() - 1)];
    }),
  );
}

/**
 * The `index`-th respondent of a family. Anchored respondents cycle through
 * the destinations in slug order, so each destination is someone's anchor.
 */
export function makeRespondent(content: UsableContent, family: ProfileFamily, index: number, seed: number): Respondent {
  if (family === "sparse") return { seed, profile: sparseProfile(content.attributes, seed) };
  const anchor = content.destinations[index % content.destinations.length]?.slug;
  if (anchor === undefined) throw new Error("no published destinations");
  return { seed, profile: anchoredProfile(content, anchor, seed), anchor };
}

/** u(o) = Σ_a w_o[a] · H[a]. */
export function optionUtility(effects: ReadonlyMap<string, number>, profile: ReadonlyMap<string, number>): number {
  let utility = 0;
  for (const [attribute, weight] of effects) utility += weight * (profile.get(attribute) ?? 0);
  return utility;
}

/** 32-bit FNV-1a, so a respondent's answer randomness depends on the question, not on when it is asked. */
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) hash = Math.imul(hash ^ slug.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/**
 * Single choice: the option with the highest utility (ties by option order).
 * Multiple choice: every option with positive utility at least half the best
 * one; the best option alone if none is positive. With probability `noise` a
 * random answer, with probability `skipRate` a skip. The same respondent gives
 * the same answer to a question whatever its position in the quiz, so quizzes
 * with different selection rules are compared on equal terms.
 */
export function respondentAnswer(
  respondent: Respondent,
  question: UsableQuestion,
  behaviour: AnswerBehaviour,
): string[] {
  let state = (respondent.seed ^ hashSlug(question.slug)) >>> 0;
  const random = () => {
    const value = mulberry32(state);
    state = (state + 0x6d2b79f5) >>> 0;
    return value;
  };
  const values = [...question.options.keys()];
  if (random() < behaviour.skipRate) return [];
  if (random() < behaviour.noise) {
    if (question.type === "single_choice") return [values[Math.floor(random() * values.length)] as string];
    for (;;) {
      const picked = values.filter(() => random() < 0.5);
      if (picked.length > 0) return picked;
    }
  }
  const utilities = values.map((value) => ({
    value,
    utility: optionUtility(question.options.get(value) ?? new Map(), respondent.profile),
  }));
  const best = utilities.reduce((top, item) => (item.utility > top.utility ? item : top));
  if (question.type === "multiple_choice" && best.utility > 0) {
    return utilities.filter((item) => item.utility > 0 && item.utility >= best.utility / 2).map((item) => item.value);
  }
  return [best.value];
}
