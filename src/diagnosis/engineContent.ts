/**
 * Maps the API snapshot to the engine's input. The endpoint returns only
 * published/active content, so statuses are set accordingly.
 */
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import type { DiagnosisContent, QuizLimits } from "../../domain/diagnosis";

export function toEngineContent(content: DiagnosisContentResponse): DiagnosisContent {
  return {
    attributes: content.attributes.map((attribute) => ({ slug: attribute.slug, status: "active" })),
    questions: content.questions.map((question) => ({
      slug: question.slug,
      category: question.category.slug,
      categoryStatus: "active",
      type: question.type,
      status: "published",
      priorityWeight: question.priorityWeight,
      options: question.options.map((option) => ({
        value: option.value,
        status: "active",
        effects: option.effects,
      })),
    })),
    destinations: content.destinations.map((destination) => ({
      slug: destination.slug,
      status: "published",
      attributeScores: destination.attributeScores,
      recommendedDays: destination.recommendedDays,
      bestMonths: destination.bestMonths,
      costs: destination.costs.map(({ currency, period, scope, min, max }) => ({ currency, period, scope, min, max })),
    })),
  };
}

export function toQuizLimits(content: DiagnosisContentResponse): QuizLimits {
  return content.settings;
}
