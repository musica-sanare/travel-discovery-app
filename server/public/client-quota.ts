/**
 * Strict per-client quota for AI explanations (docs/working/DECISIONS.md
 * ADR-029). One Durable Object per rate-limit key applies these rules, so
 * every request of a client is counted in one place, whatever connection or
 * Cloudflare location it arrives on.
 */
import type { AiRateLimit, QuotaLimits } from "../../shared/ai-quota";

export { AI_CLIENT_QUOTA } from "../../shared/ai-quota";

/** Counts only; the object identity is the client, so no key is stored. */
export interface QuotaState {
  utcDay: number;
  dayCount: number;
  windowStart: number;
  windowCount: number;
}

const DAY_MS = 86_400_000;

export function utcDay(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/** Start of the next UTC day, when a client's stored counts are deleted. */
export function nextUtcMidnight(nowMs: number): number {
  return (utcDay(nowMs) + 1) * DAY_MS;
}

/** Which limit refused a request and when a request can pass again (epoch ms). */
export interface QuotaRefusal {
  limit: AiRateLimit;
  retryAt: number;
}

/** Result of one quota check, as returned by the Durable Object. */
export type QuotaDecision = { success: true } | ({ success: false } & QuotaRefusal);

/**
 * Refused requests are not counted, so a refusal needs no storage write. When
 * both limits are reached, the daily limit is reported, because it lasts longer.
 */
export function applyQuota(
  state: QuotaState | null,
  nowMs: number,
  limits: QuotaLimits,
): { allowed: true; state: QuotaState } | { allowed: false; state: QuotaState; refusal: QuotaRefusal } {
  const today = utcDay(nowMs);
  const sameDay = state !== null && state.utcDay === today;
  const dayCount = sameDay ? state.dayCount : 0;
  const windowOpen = sameDay && nowMs - state.windowStart < limits.windowMs;
  const windowStart = windowOpen ? state.windowStart : nowMs;
  const windowCount = windowOpen ? state.windowCount : 0;
  const current = { utcDay: today, dayCount, windowStart, windowCount };
  if (dayCount >= limits.perUtcDay) {
    return { allowed: false, state: current, refusal: { limit: "daily", retryAt: nextUtcMidnight(nowMs) } };
  }
  if (windowCount >= limits.perWindow) {
    return { allowed: false, state: current, refusal: { limit: "window", retryAt: windowStart + limits.windowMs } };
  }
  return { allowed: true, state: { ...current, dayCount: dayCount + 1, windowCount: windowCount + 1 } };
}

/**
 * Durable Object name for a rate-limit key: a SHA-256 hex digest, so the
 * address never appears as an object name. An unkeyed hash of an IPv4
 * address can be reversed by trying every address; it only keeps the raw
 * address out of names shown in tools such as Data Studio.
 */
export async function clientObjectName(rateLimitKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ai-client:v1:${rateLimitKey}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
