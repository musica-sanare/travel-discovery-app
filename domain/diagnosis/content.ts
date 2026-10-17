/**
 * Reduces raw content to what the engine may use: active attributes,
 * publishable questions with active options, and published destinations
 * (docs/DIAGNOSTIC_ALGORITHM.md §1).
 */
import type { DestinationContent, DiagnosisContent, QuestionType } from "./types";

/** Locale-independent ordering for slugs. */
export function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface UsableQuestion {
  slug: string;
  category: string;
  type: QuestionType;
  priorityWeight: number;
  /** Active options by value, each with its effects on usable attributes. */
  options: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Usable attributes some active option affects, in slug order. */
  attributes: readonly string[];
}

export interface UsableContent {
  /** Active attribute slugs in slug order. */
  attributes: readonly string[];
  questions: ReadonlyMap<string, UsableQuestion>;
  /** Published questions skipped because no active option affects an active attribute. */
  questionsWithoutEffects: readonly string[];
  destinations: readonly DestinationContent[];
}

export function prepareContent(content: DiagnosisContent): UsableContent {
  const attributes = content.attributes
    .filter((attribute) => attribute.status === "active")
    .map((attribute) => attribute.slug)
    .sort(compareSlugs);
  const attributeSet = new Set(attributes);

  const questions = new Map<string, UsableQuestion>();
  const questionsWithoutEffects: string[] = [];
  for (const question of content.questions) {
    if (question.status !== "published" || question.categoryStatus !== "active") {
      continue;
    }
    const options = new Map<string, ReadonlyMap<string, number>>();
    const touched = new Set<string>();
    for (const option of question.options) {
      if (option.status !== "active") {
        continue;
      }
      const effects = new Map<string, number>();
      for (const effect of option.effects) {
        if (attributeSet.has(effect.attribute) && effect.weight !== 0) {
          effects.set(effect.attribute, effect.weight);
          touched.add(effect.attribute);
        }
      }
      options.set(option.value, effects);
    }
    if (options.size < 2) {
      continue;
    }
    if (touched.size === 0) {
      questionsWithoutEffects.push(question.slug);
      continue;
    }
    questions.set(question.slug, {
      slug: question.slug,
      category: question.category,
      type: question.type,
      priorityWeight: question.priorityWeight,
      options,
      attributes: [...touched].sort(compareSlugs),
    });
  }

  return {
    attributes,
    questions,
    questionsWithoutEffects: questionsWithoutEffects.sort(compareSlugs),
    destinations: content.destinations
      .filter((destination) => destination.status === "published")
      .sort((a, b) => compareSlugs(a.slug, b.slug)),
  };
}
