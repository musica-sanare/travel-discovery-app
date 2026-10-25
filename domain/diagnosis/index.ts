/**
 * Deterministic diagnostic engine (docs/en/DIAGNOSTIC_ALGORITHM.md). Pure
 * TypeScript: no React, database, Cloudflare bindings, network, or AI.
 */
export type * from "./types";
export { durationStatus, seasonStatus, type DurationStatus, type SeasonStatus } from "./annotations";
export { compareBudget, type BudgetComparison, type BudgetStatus } from "./budget";
export type { IgnoredAnswer, IgnoredAnswerReason } from "./preferences";
export { isValidSeed } from "./random";
export {
  rankDestinations,
  type RankedDestination,
  type RankingNotice,
  type RankingResult,
} from "./ranking";
export type { AttributeContribution } from "./scoring";
export { nextQuestion, plannedQuestionCount, type NextStep, type StopReason } from "./selection";
export { topPreferences } from "./summary";
