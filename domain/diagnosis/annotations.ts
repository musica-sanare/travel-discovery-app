/**
 * Season and trip-duration notes (docs/en/DIAGNOSTIC_ALGORITHM.md §6). They never
 * exclude or reorder destinations.
 */
import type { DestinationContent } from "./types";

export type SeasonStatus = "not_applicable" | "unknown" | "in_season" | "partly_in_season" | "off_season";

export type DurationStatus =
  | "not_applicable"
  | "unknown"
  | "shorter_than_recommended"
  | "within_recommended"
  | "longer_than_recommended";

export function seasonStatus(
  destination: DestinationContent,
  travelMonths: readonly number[] | undefined,
): SeasonStatus {
  if (!travelMonths || travelMonths.length === 0) {
    return "not_applicable";
  }
  if (!destination.bestMonths || destination.bestMonths.length === 0) {
    return "unknown";
  }
  const best = new Set(destination.bestMonths);
  const months = [...new Set(travelMonths)];
  const matching = months.filter((month) => best.has(month)).length;
  return matching === months.length ? "in_season" : matching > 0 ? "partly_in_season" : "off_season";
}

export function durationStatus(destination: DestinationContent, tripDays: number | undefined): DurationStatus {
  if (tripDays === undefined) {
    return "not_applicable";
  }
  const { min, max } = destination.recommendedDays;
  if (min === null && max === null) {
    return "unknown";
  }
  if (min !== null && tripDays < min) {
    return "shorter_than_recommended";
  }
  if (max !== null && tripDays > max) {
    return "longer_than_recommended";
  }
  return "within_recommended";
}
