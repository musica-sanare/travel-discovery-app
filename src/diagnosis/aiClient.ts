/**
 * Client for the optional AI explanation endpoint (docs/DECISIONS.md
 * ADR-026). Called only when the user turned AI assistance on. Every failure
 * maps to a reason for a non-blocking notice; the deterministic results never
 * depend on this call.
 */
import {
  AI_EXPLANATIONS_PATH,
  aiExplanationResponseSchema,
  type AiExplanationRequest,
} from "../../shared/ai-explanation";

export const AI_CLIENT_TIMEOUT_MS = 12_000;

export type AiFailure = "content_changed" | "rate_limited" | "unavailable";

export type AiExplanationResult =
  | { ok: true; texts: ReadonlyMap<string, string> }
  | { ok: false; reason: AiFailure };

function failureFor(status: number): AiFailure {
  if (status === 409) return "content_changed";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

/**
 * Sends one request and validates the response. Texts are accepted only for
 * slugs in `request.expected`. Throws only when `signal` aborts (the caller
 * no longer needs the result).
 */
export async function fetchAiExplanations(
  request: AiExplanationRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  timeoutMs = AI_CLIENT_TIMEOUT_MS,
): Promise<AiExplanationResult> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  const timer = setTimeout(abort, timeoutMs);
  signal?.addEventListener("abort", abort);
  try {
    const response = await fetchImpl(AI_EXPLANATIONS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: failureFor(response.status) };
    }
    const parsed = aiExplanationResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, reason: "unavailable" };
    }
    const expected = new Set(request.expected);
    const texts = new Map(
      parsed.data.explanations.filter((item) => expected.has(item.slug)).map((item) => [item.slug, item.text]),
    );
    return texts.size === 0 ? { ok: false, reason: "unavailable" } : { ok: true, texts };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
