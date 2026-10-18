/**
 * Validation of model output (docs/DECISIONS.md ADR-026).
 * - Structural checks (exact shape, exact set of input IDs) keep the model from
 *   adding, dropping, or duplicating destinations.
 * - Text guards reject some obvious failure patterns (numbers, links, markup,
 *   wrong script). They are auxiliary: they cannot show that a text is
 *   accurate or free of invented facts or ranking claims.
 */
import { z } from "zod";
import { MAX_EXPLANATION_LENGTH } from "../../shared/ai-explanation";
import type { Locale } from "../../shared/locales";
import { MAX_RESULT_COUNT } from "../../shared/quiz-settings";

export const MIN_EXPLANATION_LENGTH = 40;

const DIGIT = /\p{Nd}/u;
const LINK = /https?:|www\.|\.(com|net|org|jp|es)\b/i;
const MARKUP = /[<>*`#|]|\]\(/;
const CJK = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export type TextRejection = "too_short" | "digit" | "link" | "markup" | "script";

/** Returns why a text is rejected, or null when it passes the guards. */
export function checkExplanationText(text: string, locale: Locale): TextRejection | null {
  if (text.length < MIN_EXPLANATION_LENGTH) return "too_short";
  if (DIGIT.test(text)) return "digit";
  if (LINK.test(text)) return "link";
  if (MARKUP.test(text)) return "markup";
  const scriptOk = locale === "ja" ? JAPANESE.test(text) : !CJK.test(text);
  return scriptOk ? null : "script";
}

const modelOutputSchema = z.strictObject({
  explanations: z
    .array(z.strictObject({ id: z.string(), text: z.string().trim().min(1).max(MAX_EXPLANATION_LENGTH) }))
    .max(MAX_RESULT_COUNT),
});

function parseJsonText(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Returns text by ID when the output names exactly the given IDs once each and
 * every text passes the guards, otherwise null (the whole response is
 * discarded).
 */
export function parseModelOutput(
  raw: unknown,
  ids: readonly string[],
  locale: Locale,
): ReadonlyMap<string, string> | null {
  const result = modelOutputSchema.safeParse(parseJsonText(raw));
  if (!result.success) {
    return null;
  }
  const texts = new Map<string, string>();
  for (const item of result.data.explanations) {
    if (texts.has(item.id) || checkExplanationText(item.text, locale) !== null) {
      return null;
    }
    texts.set(item.id, item.text);
  }
  const sameSet = texts.size === ids.length && ids.every((id) => texts.has(id));
  return sameSet ? texts : null;
}
