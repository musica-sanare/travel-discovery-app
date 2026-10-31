/**
 * Contract of `POST /api/ai/explanations` (docs/working/DECISIONS.md ADR-026). The
 * request carries only validated IDs and constraint values; the server
 * recomputes the ranking and treats `expected` as an equality check only. The
 * response carries explanation text per destination slug and nothing that
 * could reorder results. Uses `zod/mini` because the browser validates
 * responses with it (ADR-023).
 */
import * as z from "zod/mini";
import { SUPPORTED_CURRENCIES } from "./costs";
import { SUPPORTED_LOCALES } from "./locales";
import { MAX_OPTIONS_PER_QUESTION, MAX_QUIZ_QUESTIONS, MAX_RESULT_COUNT } from "./quiz-settings";
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from "./slug";
import { MAX_BUDGET, MAX_TRIP_DAYS } from "./trip-constraints";

export const AI_EXPLANATIONS_PATH = "/api/ai/explanations";
/** `GET`: whether this deployment offers AI explanations at all (`{ enabled }`), not any client's quota. */
export const AI_STATUS_PATH = "/api/ai/status";
/** Upper bound for one explanation text, enforced on model output and responses. */
export const MAX_EXPLANATION_LENGTH = 400;

const slug = z.string().check(z.maxLength(MAX_SLUG_LENGTH), z.regex(SLUG_PATTERN));
const int = (min: number, max: number) => z.number().check(z.int(), z.gte(min), z.lte(max));

function isUnique(items: readonly unknown[]): boolean {
  return new Set(items).size === items.length;
}

const answer = z.strictObject({
  question: slug,
  options: z.array(slug).check(z.maxLength(MAX_OPTIONS_PER_QUESTION), z.refine(isUnique, "duplicate_value")),
});

export const aiExplanationRequestSchema = z.strictObject({
  locale: z.enum(SUPPORTED_LOCALES),
  answers: z
    .array(answer)
    .check(
      z.minLength(1),
      z.maxLength(MAX_QUIZ_QUESTIONS),
      z.refine((items) => isUnique(items.map((item) => item.question)), "duplicate_question"),
    ),
  constraints: z.strictObject({
    days: z.optional(int(1, MAX_TRIP_DAYS)),
    months: z.optional(z.array(int(1, 12)).check(z.maxLength(12), z.refine(isUnique, "duplicate_month"))),
    budget: z.optional(z.strictObject({ amount: int(1, MAX_BUDGET), currency: z.enum(SUPPORTED_CURRENCIES) })),
  }),
  expected: z.array(slug).check(z.minLength(1), z.maxLength(MAX_RESULT_COUNT), z.refine(isUnique, "duplicate_value")),
});

export type AiExplanationRequest = z.infer<typeof aiExplanationRequestSchema>;

export const aiExplanationResponseSchema = z.object({
  explanations: z
    .array(z.object({ slug, text: z.string().check(z.minLength(1), z.maxLength(MAX_EXPLANATION_LENGTH)) }))
    .check(z.maxLength(MAX_RESULT_COUNT)),
});

export type AiExplanationResponse = z.infer<typeof aiExplanationResponseSchema>;

export const aiStatusResponseSchema = z.object({ enabled: z.boolean() });

export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;
