/**
 * Destination fit score (docs/DIAGNOSTIC_ALGORITHM.md §3). Budget, season,
 * and duration never enter this module.
 */
import { signalStrength } from "./preferences";
import type { DestinationContent } from "./types";

export const NEUTRAL_FIT = 50;

/** Maps a 0-5 attribute score to [-1, 1] with 2.5 as neutral. */
export function centeredScore(score: number): number {
  return (2 * score - 5) / 5;
}

export interface AttributeContribution {
  attribute: string;
  value: number;
}

export interface DestinationFit {
  /** Unrounded fit in [0, 100]. */
  fit: number;
  /** Share of relevant attributes the destination has a score for, in [0, 1]. */
  coverage: number;
  /** P[a] · x_d[a] for every scored attribute with a signal, in attribute order. */
  contributions: readonly AttributeContribution[];
}

/**
 * @param attributes usable attribute slugs in slug order
 * @param preferences P[a] for each usable attribute
 */
export function scoreDestination(
  destination: DestinationContent,
  attributes: readonly string[],
  preferences: ReadonlyMap<string, number>,
): DestinationFit {
  const scores = new Map(destination.attributeScores.map((item) => [item.attribute, item.score]));
  const strength = signalStrength(preferences);
  const relevant = strength === 0 ? attributes : attributes.filter((a) => (preferences.get(a) ?? 0) !== 0);

  let weighted = 0;
  const contributions: AttributeContribution[] = [];
  for (const attribute of attributes) {
    const preference = preferences.get(attribute) ?? 0;
    const score = scores.get(attribute);
    if (preference === 0 || score === undefined) {
      continue;
    }
    const value = preference * centeredScore(score);
    weighted += value;
    contributions.push({ attribute, value });
  }

  const covered = relevant.filter((attribute) => scores.has(attribute)).length;
  return {
    fit: strength === 0 ? NEUTRAL_FIT : NEUTRAL_FIT + (NEUTRAL_FIT * weighted) / strength,
    coverage: relevant.length === 0 ? 0 : covered / relevant.length,
    contributions,
  };
}
