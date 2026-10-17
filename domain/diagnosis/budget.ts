/**
 * Budget comparison, kept separate from scoring
 * (docs/DIAGNOSTIC_ALGORITHM.md §5). No currency conversion is performed.
 */
import { BUDGET_COMPARABLE_SCOPE, type CostPeriod, type Currency } from "../../shared/costs";
import type { Budget, DestinationContent } from "./types";

export type BudgetStatus = "not_applicable" | "unknown" | "incomparable" | "within" | "partial" | "over";

export interface BudgetComparison {
  status: BudgetStatus;
  /** The estimate used and its range for the whole trip, when comparable. */
  estimate?: { currency: Currency; period: CostPeriod; tripMin: number; tripMax: number };
}

/**
 * @param budget validated upper limit (positive amount)
 * @param tripDays validated trip length, if supplied
 */
export function compareBudget(
  destination: DestinationContent,
  budget: Budget | undefined,
  tripDays: number | undefined,
): BudgetComparison {
  if (!budget) {
    return { status: "not_applicable" };
  }
  if (destination.costs.length === 0) {
    return { status: "unknown" };
  }
  const estimate = destination.costs.find(
    (cost) => cost.currency === budget.currency && cost.scope === BUDGET_COMPARABLE_SCOPE,
  );
  if (!estimate) {
    return { status: "incomparable" };
  }

  let tripMin: number;
  let tripMax: number;
  if (estimate.period === "per_trip") {
    tripMin = estimate.min;
    tripMax = estimate.max;
  } else if (tripDays !== undefined) {
    tripMin = estimate.min * tripDays;
    tripMax = estimate.max * tripDays;
  } else {
    // Without trip days, scale by the recommended stay; the shortest stay sets
    // the lower bound so exclusion only happens when even that exceeds the budget.
    const { min, max } = destination.recommendedDays;
    if (min === null || max === null) {
      return { status: "unknown" };
    }
    tripMin = estimate.min * min;
    tripMax = estimate.max * max;
  }

  const status: BudgetStatus =
    tripMin > budget.amount ? "over" : tripMax <= budget.amount ? "within" : "partial";
  return {
    status,
    estimate: { currency: estimate.currency, period: estimate.period, tripMin, tripMax },
  };
}
