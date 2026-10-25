/**
 * Turns answers into the preference vector P (docs/en/DIAGNOSTIC_ALGORITHM.md §2).
 */
import type { UsableContent } from "./content";
import type { Answer } from "./types";

export type IgnoredAnswerReason =
  | "unknown_question"
  | "duplicate_question"
  | "no_valid_option"
  | "too_many_options";

export interface IgnoredAnswer {
  question: string;
  reason: IgnoredAnswerReason;
}

export interface Preferences {
  /** P[a] for every usable attribute (0 when no signal). */
  values: ReadonlyMap<string, number>;
  /** Usable questions already shown, including skipped ones, in answer order. */
  asked: readonly string[];
  ignored: readonly IgnoredAnswer[];
}

/**
 * Contribution of one answer: the per-attribute mean over the selected
 * options, counting an undefined effect as 0 (denominator = selected count).
 */
export function answerContribution(
  options: ReadonlyMap<string, ReadonlyMap<string, number>>,
  selected: readonly string[],
): Map<string, number> {
  const contribution = new Map<string, number>();
  if (selected.length === 0) {
    return contribution;
  }
  for (const value of selected) {
    for (const [attribute, weight] of options.get(value) ?? []) {
      contribution.set(attribute, (contribution.get(attribute) ?? 0) + weight);
    }
  }
  for (const [attribute, sum] of contribution) {
    contribution.set(attribute, sum / selected.length);
  }
  return contribution;
}

export function buildPreferences(content: UsableContent, answers: readonly Answer[]): Preferences {
  const values = new Map<string, number>(content.attributes.map((attribute) => [attribute, 0]));
  const asked: string[] = [];
  const ignored: IgnoredAnswer[] = [];

  for (const answer of answers) {
    const question = content.questions.get(answer.question);
    if (!question) {
      ignored.push({ question: answer.question, reason: "unknown_question" });
      continue;
    }
    if (asked.includes(question.slug)) {
      ignored.push({ question: question.slug, reason: "duplicate_question" });
      continue;
    }
    asked.push(question.slug);

    const selected = [...new Set(answer.options)].filter((value) => question.options.has(value));
    if (selected.length === 0) {
      if (answer.options.length > 0) {
        ignored.push({ question: question.slug, reason: "no_valid_option" });
      }
      continue;
    }
    if (question.type === "single_choice" && selected.length > 1) {
      ignored.push({ question: question.slug, reason: "too_many_options" });
      continue;
    }
    for (const [attribute, value] of answerContribution(question.options, selected)) {
      values.set(attribute, (values.get(attribute) ?? 0) + value);
    }
  }

  return { values, asked, ignored };
}

/** Σ|P[a]|; 0 means there is no preference signal. */
export function signalStrength(preferences: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of preferences.values()) {
    total += Math.abs(value);
  }
  return total;
}
