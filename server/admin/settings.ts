/**
 * Admin input for global settings. The `quiz` value schema is shared with the
 * public diagnosis content endpoint (shared/quiz-settings.ts).
 */
import { z } from "zod";
import { QUIZ_SETTINGS_KEY, quizSettingsSchema } from "../../shared/quiz-settings";

export {
  DEFAULT_QUIZ_SETTINGS,
  parseStoredQuizSettings,
  quizSettingsSchema,
  type QuizSettings,
} from "../../shared/quiz-settings";

export const settingsInput = z.object({ quiz: quizSettingsSchema });
export type SettingsInput = z.infer<typeof settingsInput>;

export const SETTINGS_KEYS = { quiz: QUIZ_SETTINGS_KEY } as const;
