/**
 * Structural validation of model output (docs/DECISIONS.md ADR-026): the exact
 * shape and the exact set of input IDs. These checks keep the model from
 * adding, dropping, or duplicating destinations; they say nothing about
 * whether the text is accurate.
 */
import { z } from "zod";
import { MAX_EXPLANATION_LENGTH } from "../../shared/ai-explanation";
import { MAX_RESULT_COUNT } from "../../shared/quiz-settings";

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
 * Returns text by ID when the output names exactly the given IDs once each,
 * otherwise null.
 */
export function parseModelOutput(raw: unknown, ids: readonly string[]): ReadonlyMap<string, string> | null {
  const result = modelOutputSchema.safeParse(parseJsonText(raw));
  if (!result.success) {
    return null;
  }
  const texts = new Map<string, string>();
  for (const item of result.data.explanations) {
    if (texts.has(item.id)) {
      return null;
    }
    texts.set(item.id, item.text);
  }
  const sameSet = texts.size === ids.length && ids.every((id) => texts.has(id));
  return sameSet ? texts : null;
}
