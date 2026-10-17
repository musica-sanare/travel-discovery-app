/** Builders for engine tests; not part of the public module surface. */
import type {
  AttributeContent,
  CostEstimate,
  DestinationContent,
  DiagnosisContent,
  OptionContent,
  QuestionContent,
  QuizLimits,
} from "./types";

export const LIMITS: QuizLimits = { minQuestions: 6, targetQuestions: 10, maxQuestions: 12, resultCount: 5 };

export function attributes(...slugs: string[]): AttributeContent[] {
  return slugs.map((slug) => ({ slug, status: "active" }));
}

export function option(value: string, effects: Record<string, number> = {}, status: OptionContent["status"] = "active"): OptionContent {
  return {
    value,
    status,
    effects: Object.entries(effects).map(([attribute, weight]) => ({ attribute, weight })),
  };
}

export function question(
  slug: string,
  options: OptionContent[],
  overrides: Partial<Omit<QuestionContent, "slug" | "options">> = {},
): QuestionContent {
  return {
    slug,
    category: "general",
    categoryStatus: "active",
    type: "single_choice",
    status: "published",
    priorityWeight: 5,
    options,
    ...overrides,
  };
}

export function destination(
  slug: string,
  scores: Record<string, number> = {},
  overrides: Partial<Omit<DestinationContent, "slug" | "attributeScores">> = {},
): DestinationContent {
  return {
    slug,
    status: "published",
    attributeScores: Object.entries(scores).map(([attribute, score]) => ({ attribute, score })),
    recommendedDays: { min: null, max: null },
    bestMonths: null,
    costs: [],
    ...overrides,
  };
}

export function estimate(overrides: Partial<CostEstimate> = {}): CostEstimate {
  return {
    currency: "JPY",
    period: "per_trip",
    scope: "per_person_excluding_international_flights",
    min: 100_000,
    max: 200_000,
    ...overrides,
  };
}

export function content(parts: Partial<DiagnosisContent>): DiagnosisContent {
  return { attributes: [], questions: [], destinations: [], ...parts };
}
