/**
 * Hard filtering, ranking, and fallback-explanation data
 * (docs/en/DIAGNOSTIC_ALGORITHM.md §4).
 */
import { durationStatus, seasonStatus, type DurationStatus, type SeasonStatus } from "./annotations";
import { compareBudget, type BudgetComparison } from "./budget";
import { compareSlugs, prepareContent } from "./content";
import { buildPreferences, signalStrength, type IgnoredAnswer } from "./preferences";
import { scoreDestination, type AttributeContribution } from "./scoring";
import type { Answer, DiagnosisContent, QuizLimits, TripConstraints } from "./types";
import { pickResults, type ResultVariety } from "./variety";

export const TOP_ATTRIBUTE_COUNT = 3;
export const STRENGTH_COUNT = 2;
/** How far above the shown results' mean a 0-5 attribute score must be to count as a strength. */
export const STRENGTH_SCORE_MARGIN = 0.75;
// Floating-point slack, so that a difference of exactly the margin counts.
const EPSILON = 1e-9;

export type RankingNotice = "fewer_than_requested" | "no_eligible_destinations" | "no_preference_signal";

export interface RankedDestination {
  slug: string;
  rank: number;
  fit: number;
  displayFit: number;
  coverage: number;
  budget: BudgetComparison;
  season: SeasonStatus;
  duration: DurationStatus;
  /** Strongest positive contributions from wanted attributes (P[a] > 0), for the deterministic explanation. */
  topAttributes: readonly AttributeContribution[];
  /**
   * Wanted attributes where this result is clearly stronger than the other shown
   * results; `value` is P[a] · (x_d[a] − mean of x[a] over the shown results).
   * Explanation data only: it never affects fit or order.
   */
  strengths: readonly AttributeContribution[];
}

export interface RankingResult {
  results: readonly RankedDestination[];
  excluded: readonly { slug: string; reason: "over_budget" }[];
  notices: readonly RankingNotice[];
  ignoredAnswers: readonly IgnoredAnswer[];
  /** True when another draw can show other destinations (a near-fit band larger than the free slots). */
  redrawable: boolean;
}

/** Ranking order: fit descending, then coverage descending, then slug ascending. */
export function compareByFit(
  a: { slug: string; fit: number; coverage: number },
  b: { slug: string; fit: number; coverage: number },
): number {
  return b.fit - a.fit || b.coverage - a.coverage || compareSlugs(a.slug, b.slug);
}

/**
 * @param constraints validated trip constraints
 * @param limits validated quiz settings (resultCount 3-5)
 * @param variety session seed and draw: the slots after the best fit come from
 *   the near-fit band (variety.ts); without it, the first `resultCount` by fit
 */
export function rankDestinations(
  content: DiagnosisContent,
  answers: readonly Answer[],
  constraints: TripConstraints,
  limits: QuizLimits,
  variety?: ResultVariety,
): RankingResult {
  const usable = prepareContent(content);
  const preferences = buildPreferences(usable, answers);

  const candidates: Omit<RankedDestination, "rank" | "strengths">[] = [];
  const contributionsBySlug = new Map<string, readonly AttributeContribution[]>();
  const excluded: { slug: string; reason: "over_budget" }[] = [];
  for (const destination of usable.destinations) {
    const budget = compareBudget(destination, constraints.budget, constraints.days);
    if (budget.status === "over") {
      excluded.push({ slug: destination.slug, reason: "over_budget" });
      continue;
    }
    const { fit, coverage, contributions } = scoreDestination(
      destination,
      usable.attributes,
      preferences.values,
    );
    contributionsBySlug.set(destination.slug, contributions);
    candidates.push({
      slug: destination.slug,
      fit,
      displayFit: Math.round(fit),
      coverage,
      budget,
      season: seasonStatus(destination, constraints.months),
      duration: durationStatus(destination, constraints.days),
      topAttributes: contributions
        .filter((item) => item.value > 0 && (preferences.values.get(item.attribute) ?? 0) > 0)
        .sort((a, b) => b.value - a.value || compareSlugs(a.attribute, b.attribute))
        .slice(0, TOP_ATTRIBUTE_COUNT),
    });
  }

  candidates.sort(compareByFit);
  const { shown, redrawable } =
    variety === undefined
      ? { shown: candidates.slice(0, limits.resultCount), redrawable: false }
      : pickResults(candidates, limits.resultCount, variety);
  const strengths = distinctiveStrengths(
    shown.map((item) => contributionsBySlug.get(item.slug) ?? []),
    preferences.values,
  );
  const results = shown.map((item, index) => ({ ...item, rank: index + 1, strengths: strengths[index] ?? [] }));

  const notices: RankingNotice[] = [];
  if (signalStrength(preferences.values) === 0) {
    notices.push("no_preference_signal");
  }
  if (results.length === 0) {
    notices.push("no_eligible_destinations");
  } else if (results.length < limits.resultCount) {
    notices.push("fewer_than_requested");
  }

  return { results, excluded, notices, ignoredAnswers: preferences.ignored, redrawable };
}

/**
 * Distinctive strengths of each shown result (docs/en/DIAGNOSTIC_ALGORITHM.md
 * "Fallback explanation data"). A missing score counts as x = 0 in the mean, as
 * in the fit, but is never a strength.
 */
export function distinctiveStrengths(
  shown: readonly (readonly AttributeContribution[])[],
  preferences: ReadonlyMap<string, number>,
  scoreMargin = STRENGTH_SCORE_MARGIN,
): AttributeContribution[][] {
  if (shown.length < 2) {
    return shown.map(() => []);
  }
  const centered = shown.map(
    (contributions) =>
      new Map(contributions.map((item) => [item.attribute, item.value / (preferences.get(item.attribute) ?? 1)])),
  );
  const mean = (attribute: string) =>
    centered.reduce((sum, values) => sum + (values.get(attribute) ?? 0), 0) / centered.length;
  const margin = (2 * scoreMargin) / 5;

  return centered.map((values) => {
    const strengths: AttributeContribution[] = [];
    for (const [attribute, x] of values) {
      const preference = preferences.get(attribute) ?? 0;
      const difference = x - mean(attribute);
      if (preference > 0 && difference >= margin - EPSILON) {
        strengths.push({ attribute, value: preference * difference });
      }
    }
    return strengths
      .sort((a, b) => b.value - a.value || compareSlugs(a.attribute, b.attribute))
      .slice(0, STRENGTH_COUNT);
  });
}
