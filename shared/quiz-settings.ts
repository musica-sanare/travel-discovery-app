/**
 * Quiz settings stored in `app_settings` under the `quiz` key. Bounds follow
 * docs/en/SPEC.md §4 and §6 (defaults: 6 / 10 / 12 questions, 3-5 results).
 * Uses `zod/mini` because the schema is also bundled into the public SPA
 * (docs/working/DECISIONS.md ADR-023).
 */
import * as z from "zod/mini";

const count = (min: number, max: number) => z.number().check(z.int(), z.gte(min), z.lte(max));

/** Upper bound for every question-count setting, and so for answers per quiz. */
export const MAX_QUIZ_QUESTIONS = 30;
export const MIN_RESULT_COUNT = 3;
export const MAX_RESULT_COUNT = 5;
/** Options per question accepted by the admin API, and so per answer. */
export const MAX_OPTIONS_PER_QUESTION = 20;

export const quizSettingsSchema = z
  .object({
    minQuestions: count(1, MAX_QUIZ_QUESTIONS),
    targetQuestions: count(1, MAX_QUIZ_QUESTIONS),
    maxQuestions: count(1, MAX_QUIZ_QUESTIONS),
    resultCount: count(MIN_RESULT_COUNT, MAX_RESULT_COUNT),
  })
  .check(
    z.refine((value) => value.minQuestions <= value.targetQuestions, {
      message: "target_below_min",
      path: ["targetQuestions"],
    }),
    z.refine((value) => value.targetQuestions <= value.maxQuestions, {
      message: "target_above_max",
      path: ["targetQuestions"],
    }),
  );

/** `app_settings.key` holding the quiz settings. */
export const QUIZ_SETTINGS_KEY = "quiz";

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  minQuestions: 6,
  targetQuestions: 10,
  maxQuestions: 12,
  resultCount: 5,
};

/** Parses a stored value, falling back to defaults if missing or invalid. */
export function parseStoredQuizSettings(valueJson: string | undefined): QuizSettings {
  if (valueJson === undefined) {
    return DEFAULT_QUIZ_SETTINGS;
  }
  try {
    const parsed = quizSettingsSchema.safeParse(JSON.parse(valueJson));
    return parsed.success ? parsed.data : DEFAULT_QUIZ_SETTINGS;
  } catch {
    return DEFAULT_QUIZ_SETTINGS;
  }
}
