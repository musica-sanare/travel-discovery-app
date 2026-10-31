/**
 * Client for the optional AI explanation endpoint (docs/working/DECISIONS.md
 * ADR-026). Called only when the user turned AI assistance on. Every failure
 * maps to a reason for a non-blocking notice; the deterministic results never
 * depend on this call.
 */
import {
  AI_EXPLANATIONS_PATH,
  aiExplanationResponseSchema,
  type AiExplanationRequest,
} from "../../shared/ai-explanation";
import { aiRateLimitedBodySchema } from "../../shared/ai-quota";

export const AI_CLIENT_TIMEOUT_MS = 12_000;

/**
 * `rate_limited` is a 429 without the documented body; `rate_limited_daily`
 * carries when the client's daily quota resets (epoch ms, 00:00 UTC).
 */
export type AiFailure =
  | { reason: "content_changed" | "rate_limited" | "rate_limited_window" | "unavailable" }
  | { reason: "rate_limited_daily"; retryAt: number };

export type AiExplanationResult = { ok: true; texts: ReadonlyMap<string, string> } | ({ ok: false } & AiFailure);

const MINUTE_MS = 60_000;

async function rateLimitFailure(response: Response): Promise<AiFailure> {
  const parsed = aiRateLimitedBodySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return { reason: "rate_limited" };
  }
  if (parsed.data.limit === "window") {
    return { reason: "rate_limited_window" };
  }
  // The daily reset is at a whole minute (00:00 UTC); rounding hides small clock differences.
  const retryAt = Math.round((Date.now() + parsed.data.retryAfter * 1000) / MINUTE_MS) * MINUTE_MS;
  return { reason: "rate_limited_daily", retryAt };
}

async function failureFor(response: Response): Promise<AiFailure> {
  if (response.status === 409) return { reason: "content_changed" };
  if (response.status === 429) return rateLimitFailure(response);
  return { reason: "unavailable" };
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
      return { ok: false, ...(await failureFor(response)) };
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
