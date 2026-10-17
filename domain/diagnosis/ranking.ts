/**
 * Hard filtering, ranking, and fallback-explanation data
 * (docs/DIAGNOSTIC_ALGORITHM.md §4).
 */
import { durationStatus, seasonStatus, type DurationStatus, type SeasonStatus } from "./annotations";
import { compareBudget, type BudgetComparison } from "./budget";
import { compareSlugs, prepareContent } from "./content";
import { buildPreferences, signalStrength, type IgnoredAnswer } from "./preferences";
import { scoreDestination, type AttributeContribution } from "./scoring";
import type { Answer, DiagnosisContent, QuizLimits, TripConstraints } from "./types";

export const TOP_ATTRIBUTE_COUNT = 3;

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
  /** Strongest positive contributions, for the deterministic explanation. */
  topAttributes: readonly AttributeContribution[];
}

export interface RankingResult {
  results: readonly RankedDestination[];
  excluded: readonly { slug: string; reason: "over_budget" }[];
  notices: readonly RankingNotice[];
  ignoredAnswers: readonly IgnoredAnswer[];
}

/**
 * @param constraints validated trip constraints
 * @param limits validated quiz settings (resultCount 3-5)
 */
export function rankDestinations(
  content: DiagnosisContent,
  answers: readonly Answer[],
  constraints: TripConstraints,
  limits: QuizLimits,
): RankingResult {
  const usable = prepareContent(content);
  const preferences = buildPreferences(usable, answers);

  const candidates: Omit<RankedDestination, "rank">[] = [];
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
    candidates.push({
      slug: destination.slug,
      fit,
      displayFit: Math.round(fit),
      coverage,
      budget,
      season: seasonStatus(destination, constraints.months),
      duration: durationStatus(destination, constraints.days),
      topAttributes: contributions
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value || compareSlugs(a.attribute, b.attribute))
        .slice(0, TOP_ATTRIBUTE_COUNT),
    });
  }

  candidates.sort((a, b) => b.fit - a.fit || b.coverage - a.coverage || compareSlugs(a.slug, b.slug));
  const results = candidates.slice(0, limits.resultCount).map((item, index) => ({ ...item, rank: index + 1 }));

  const notices: RankingNotice[] = [];
  if (signalStrength(preferences.values) === 0) {
    notices.push("no_preference_signal");
  }
  if (results.length === 0) {
    notices.push("no_eligible_destinations");
  } else if (results.length < limits.resultCount) {
    notices.push("fewer_than_requested");
  }

  return { results, excluded, notices, ignoredAnswers: preferences.ignored };
}
