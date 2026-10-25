/**
 * Input and output shapes of the diagnostic engine. Content is identified by
 * stable slugs; the engine filters inactive content itself
 * (docs/en/DIAGNOSTIC_ALGORITHM.md §1).
 */
import type { CostPeriod, CostScope, Currency } from "../../shared/costs";

export type ContentStatus = "draft" | "published" | "archived";
export type TaxonomyStatus = "active" | "archived";
export type QuestionType = "single_choice" | "multiple_choice";

export interface AttributeContent {
  slug: string;
  status: TaxonomyStatus;
}

export interface OptionContent {
  value: string;
  status: TaxonomyStatus;
  effects: readonly { attribute: string; weight: number }[];
}

export interface QuestionContent {
  slug: string;
  category: string;
  categoryStatus: TaxonomyStatus;
  type: QuestionType;
  status: ContentStatus;
  priorityWeight: number;
  options: readonly OptionContent[];
}

export interface CostEstimate {
  currency: Currency;
  period: CostPeriod;
  scope: CostScope;
  min: number;
  max: number;
}

export interface DestinationContent {
  slug: string;
  status: ContentStatus;
  attributeScores: readonly { attribute: string; score: number }[];
  recommendedDays: { min: number | null; max: number | null };
  /** Months 1-12; null when unknown. */
  bestMonths: readonly number[] | null;
  costs: readonly CostEstimate[];
}

export interface DiagnosisContent {
  attributes: readonly AttributeContent[];
  questions: readonly QuestionContent[];
  destinations: readonly DestinationContent[];
}

/** An empty `options` list means the question was shown and skipped. */
export interface Answer {
  question: string;
  options: readonly string[];
}

export interface Budget {
  /** Upper limit per person for the whole trip, excluding international flights. */
  amount: number;
  currency: Currency;
}

export interface TripConstraints {
  days?: number;
  months?: readonly number[];
  budget?: Budget;
}

export interface QuizLimits {
  minQuestions: number;
  targetQuestions: number;
  maxQuestions: number;
  resultCount: number;
}
