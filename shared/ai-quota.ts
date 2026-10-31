/**
 * Per-client AI quota (docs/working/DECISIONS.md ADR-029) and the 429 body
 * that reports which limit refused a request. Shared so that the server
 * applies, and the UI states, the same limits. Uses `zod/mini` because the
 * browser validates the body (ADR-023).
 */
import * as z from "zod/mini";

export interface QuotaLimits {
  windowMs: number;
  perWindow: number;
  perUtcDay: number;
}

/** 5 per 60 s, as the Rate Limiting binding, plus 30 per UTC day. */
export const AI_CLIENT_QUOTA: QuotaLimits = { windowMs: 60_000, perWindow: 5, perUtcDay: 30 };

export const AI_RATE_LIMITS = ["window", "daily"] as const;
export type AiRateLimit = (typeof AI_RATE_LIMITS)[number];

/** Longest wait the server reports: until the next 00:00 UTC. */
export const MAX_RETRY_AFTER_SECONDS = 86_400;

/** `429` body of `POST /api/ai/explanations`; `retryAfter` equals the `Retry-After` header (seconds). */
export const aiRateLimitedBodySchema = z.object({
  error: z.literal("rate_limited"),
  limit: z.enum(AI_RATE_LIMITS),
  retryAfter: z.number().check(z.int(), z.gte(1), z.lte(MAX_RETRY_AFTER_SECONDS)),
});

export type AiRateLimitedBody = z.infer<typeof aiRateLimitedBodySchema>;
