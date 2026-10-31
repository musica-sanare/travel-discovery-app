/**
 * Validation of model output (docs/working/DECISIONS.md ADR-026).
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

/**
 * Lowered from 40 after evaluation (docs/working/DECISIONS.md ADR-026 "Evaluation
 * round 2"): models answer sparse destinations briefly instead of inventing
 * details, and a short honest note is acceptable.
 */
export const MIN_EXPLANATION_LENGTH = 10;

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

/** Why a whole model answer was discarded; logged as a fixed code, never with content. */
export type OutputRejection = "json" | "shape" | "too_long" | "duplicate_id" | "id_set" | TextRejection;

export type ModelOutputResult =
  | { ok: true; texts: ReadonlyMap<string, string> }
  | { ok: false; reason: OutputRejection };

/**
 * Accepts the output only when it names exactly the given IDs once each and
 * every text passes the guards; otherwise reports the first failed check (the
 * whole response is discarded).
 */
export function validateModelOutput(raw: unknown, ids: readonly string[], locale: Locale): ModelOutputResult {
  const json = parseJsonText(raw);
  if (json === undefined) {
    return { ok: false, reason: "json" };
  }
  const result = modelOutputSchema.safeParse(json);
  if (!result.success) {
    const textTooLong = result.error.issues.some((issue) => issue.code === "too_big" && issue.path.at(-1) === "text");
    return { ok: false, reason: textTooLong ? "too_long" : "shape" };
  }
  const texts = new Map<string, string>();
  for (const item of result.data.explanations) {
    if (texts.has(item.id)) {
      return { ok: false, reason: "duplicate_id" };
    }
    const rejection = checkExplanationText(item.text, locale);
    if (rejection !== null) {
      return { ok: false, reason: rejection };
    }
    texts.set(item.id, item.text);
  }
  const sameSet = texts.size === ids.length && ids.every((id) => texts.has(id));
  return sameSet ? { ok: true, texts } : { ok: false, reason: "id_set" };
}

/** Text by ID for valid output, otherwise null. */
export function parseModelOutput(
  raw: unknown,
  ids: readonly string[],
  locale: Locale,
): ReadonlyMap<string, string> | null {
  const result = validateModelOutput(raw, ids, locale);
  return result.ok ? result.texts : null;
}
