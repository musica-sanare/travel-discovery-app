/**
 * Admin API response and payload shapes as consumed by the admin UI. The
 * server validates every payload (server/admin/validation.ts); these types only
 * describe the JSON exchanged with it.
 */
import type { Locale } from "../../shared/locales";

export type Translated<T> = Partial<Record<Locale, T>>;
export type ContentStatus = "draft" | "published" | "archived";
export type TaxonomyStatus = "active" | "archived";
export type DestinationType = "city" | "region" | "island" | "other";
export type CostScope =
  | "per_person_excluding_international_flights"
  | "per_person_including_international_flights";
export type QuestionType = "single_choice" | "multiple_choice";

export const CONTENT_STATUSES: readonly ContentStatus[] = ["draft", "published", "archived"];
export const TAXONOMY_STATUSES: readonly TaxonomyStatus[] = ["active", "archived"];
export const DESTINATION_TYPES: readonly DestinationType[] = ["city", "region", "island", "other"];
export const COST_SCOPES: readonly CostScope[] = [
  "per_person_excluding_international_flights",
  "per_person_including_international_flights",
];
export const QUESTION_TYPES: readonly QuestionType[] = ["single_choice", "multiple_choice"];

export interface TaxonomyItem {
  id: number;
  slug: string;
  status?: TaxonomyStatus;
  translations: Translated<{ name: string; description?: string | null }>;
}

export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

export interface DestinationListItem {
  id: number;
  slug: string;
  status: ContentStatus;
  type: DestinationType;
  names: Translated<string>;
}

export interface DestinationTranslation {
  name: string;
  summary: string;
  highlights: string[];
  cautions: string | null;
  bestSeason: string | null;
  costBasis: string | null;
  imageAlt: string | null;
}

export interface DestinationDetail {
  id: number;
  slug: string;
  countryId: number;
  type: DestinationType;
  status: ContentStatus;
  recommendedDays: { min: number | null; max: number | null };
  cost: {
    min: number;
    max: number;
    currency: string;
    scope: CostScope;
    sourceName: string;
    sourceUrl: string | null;
    updatedAt: string;
  } | null;
  image: { url: string; attribution: string } | null;
  translations: Translated<DestinationTranslation>;
  attributeScores: { attributeId: number; score: number }[];
}

export interface QuestionListItem {
  id: number;
  slug: string;
  status: ContentStatus;
  categoryId: number;
  prompts: Translated<string>;
}

export interface QuestionOption {
  value: string;
  displayOrder: number;
  status?: TaxonomyStatus;
  translations: Translated<{ label: string }>;
  effects: { attributeId: number; weight: number }[];
}

export interface QuestionDetail {
  id: number;
  slug: string;
  categoryId: number;
  type: QuestionType;
  status: ContentStatus;
  priorityWeight: number;
  displayOrder: number | null;
  translations: Translated<{ prompt: string; description: string | null }>;
  options: QuestionOption[];
}

export interface QuizSettings {
  minQuestions: number;
  targetQuestions: number;
  maxQuestions: number;
  resultCount: number;
}
