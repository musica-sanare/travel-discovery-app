/**
 * Validation of model output (docs/working/DECISIONS.md ADR-026).
 * - Structural checks (exact shape, exact set of input IDs) keep the model from
 *   adding, dropping, or duplicating destinations. A structural failure
 *   discards the whole answer.
 * - Text guards reject some obvious failure patterns (numbers not copied from
 *   the destination's own data, links, markup, wrong script). A failed text
 *   drops only that destination's note. The guards are auxiliary: they cannot
 *   show that a text is accurate or free of invented facts or ranking claims.
 */
import { z } from "zod";
import { MAX_EXPLANATION_LENGTH } from "../../shared/ai-explanation";
import type { Locale } from "../../shared/locales";
import { MAX_RESULT_COUNT } from "../../shared/quiz-settings";
import type { ExplanationDestination, ExplanationInput } from "./provider";

/**
 * Lowered from 40 after evaluation (docs/working/DECISIONS.md ADR-026 "Evaluation
 * round 2"): models answer sparse destinations briefly instead of inventing
 * details, and a short honest note is acceptable.
 */
export const MIN_EXPLANATION_LENGTH = 10;

/**
 * A digit sequence: digits, optionally joined to more digits by one of
 * `x . , : / -` (so "4x4" and "28" are single sequences). Compared after NFKC
 * normalization, so full-width digits equal ASCII ones.
 */
const DIGIT_SEQUENCE = /\p{Nd}+(?:[x.,:/-]\p{Nd}+)*/gu;
const LINK = /https?:|www\.|\.(com|net|org|jp|es)\b/i;
const MARKUP = /[<>*`#|]|\]\(/;
const CJK = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export type TextRejection = "too_short" | "too_long" | "digit" | "link" | "markup" | "script";

/** Digit sequences in a text, NFKC-normalized. */
export function digitSequences(text: string): string[] {
  return text.normalize("NFKC").match(DIGIT_SEQUENCE) ?? [];
}

/** Digit sequences a note about this destination may copy: those in the data sent to the model for it. */
export function allowedDigitSequences(destination: ExplanationDestination): ReadonlySet<string> {
  const fields = [destination.name, destination.country ?? "", destination.summary, ...destination.highlights];
  return new Set(fields.flatMap(digitSequences));
}

/**
 * Returns why a text is rejected, or null when it passes the guards. A digit
 * sequence passes only when it is in `allowedDigits`.
 */
export function checkExplanationText(
  text: string,
  locale: Locale,
  allowedDigits: ReadonlySet<string> = new Set(),
): TextRejection | null {
  if (text.length < MIN_EXPLANATION_LENGTH) return "too_short";
  if (text.length > MAX_EXPLANATION_LENGTH) return "too_long";
  if (digitSequences(text).some((sequence) => !allowedDigits.has(sequence))) return "digit";
  if (LINK.test(text)) return "link";
  if (MARKUP.test(text)) return "markup";
  const scriptOk = locale === "ja" ? JAPANESE.test(text) : !CJK.test(text);
  return scriptOk ? null : "script";
}

const modelOutputSchema = z.strictObject({
  explanations: z.array(z.strictObject({ id: z.string(), text: z.string().trim() })).max(MAX_RESULT_COUNT),
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
 * Why a whole model answer was discarded; logged as a fixed code, never with
 * content. `all_dropped`: the structure was valid but every note failed a
 * text guard.
 */
export type OutputRejection = "json" | "shape" | "duplicate_id" | "id_set" | "all_dropped";

export type ModelOutputResult =
  | { ok: true; texts: ReadonlyMap<string, string>; dropped: readonly TextRejection[] }
  | { ok: false; reason: OutputRejection; dropped: readonly TextRejection[] };

/**
 * Discards the whole output when it is not JSON, has the wrong shape, or does
 * not name exactly the input IDs once each. Otherwise drops only the notes
 * that fail a text guard, and reports their reasons in input order. An answer
 * with every note dropped is rejected as `all_dropped`.
 */
export function validateModelOutput(raw: unknown, input: ExplanationInput): ModelOutputResult {
  const json = parseJsonText(raw);
  if (json === undefined) {
    return { ok: false, reason: "json", dropped: [] };
  }
  const result = modelOutputSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, reason: "shape", dropped: [] };
  }
  const answers = new Map<string, string>();
  for (const item of result.data.explanations) {
    if (answers.has(item.id)) {
      return { ok: false, reason: "duplicate_id", dropped: [] };
    }
    answers.set(item.id, item.text);
  }
  const ids = input.destinations.map((item) => item.id);
  if (answers.size !== ids.length || !ids.every((id) => answers.has(id))) {
    return { ok: false, reason: "id_set", dropped: [] };
  }

  const texts = new Map<string, string>();
  const dropped: TextRejection[] = [];
  for (const destination of input.destinations) {
    const text = answers.get(destination.id) ?? "";
    const rejection = checkExplanationText(text, input.locale, allowedDigitSequences(destination));
    if (rejection === null) {
      texts.set(destination.id, text);
    } else {
      dropped.push(rejection);
    }
  }
  return texts.size === 0 ? { ok: false, reason: "all_dropped", dropped } : { ok: true, texts, dropped };
}
