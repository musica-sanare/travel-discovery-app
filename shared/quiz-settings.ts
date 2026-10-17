/**
 * Quiz settings stored in `app_settings` under the `quiz` key. Bounds follow
 * docs/SPEC.md §4 and §6 (defaults: 6 / 10 / 12 questions, 3-5 results).
 */
import { z } from "zod";

export const quizSettingsSchema = z
  .object({
    minQuestions: z.number().int().min(1).max(30),
    targetQuestions: z.number().int().min(1).max(30),
    maxQuestions: z.number().int().min(1).max(30),
    resultCount: z.number().int().min(3).max(5),
  })
  .refine((value) => value.minQuestions <= value.targetQuestions, {
    message: "target_below_min",
    path: ["targetQuestions"],
  })
  .refine((value) => value.targetQuestions <= value.maxQuestions, {
    message: "target_above_max",
    path: ["targetQuestions"],
  });

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
