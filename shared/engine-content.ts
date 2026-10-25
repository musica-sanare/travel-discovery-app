/**
 * Maps the diagnosis content snapshot to the engine's input. The snapshot
 * contains only published/active content, so statuses are set accordingly.
 * Used by the browser and by the AI explanation endpoint, so both rank the
 * same content the same way (docs/working/DECISIONS.md ADR-026).
 */
import type { DiagnosisContent, QuizLimits } from "../domain/diagnosis";
import type { DiagnosisContentResponse } from "./diagnosis-content";

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
