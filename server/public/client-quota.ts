/**
 * Strict per-client quota for AI explanations (docs/working/DECISIONS.md
 * ADR-029). One Durable Object per rate-limit key applies these rules, so
 * every request of a client is counted in one place, whatever connection or
 * Cloudflare location it arrives on.
 */
export interface QuotaLimits {
  windowMs: number;
  perWindow: number;
  perUtcDay: number;
}

/** 5 per 60 s, as the Rate Limiting binding, plus 30 per UTC day. */
export const AI_CLIENT_QUOTA: QuotaLimits = { windowMs: 60_000, perWindow: 5, perUtcDay: 30 };

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

/** Refused requests are not counted, so a refusal needs no storage write. */
export function applyQuota(
  state: QuotaState | null,
  nowMs: number,
  limits: QuotaLimits,
): { allowed: boolean; state: QuotaState } {
  const today = utcDay(nowMs);
  const sameDay = state !== null && state.utcDay === today;
  const dayCount = sameDay ? state.dayCount : 0;
  const windowOpen = sameDay && nowMs - state.windowStart < limits.windowMs;
  const windowStart = windowOpen ? state.windowStart : nowMs;
  const windowCount = windowOpen ? state.windowCount : 0;
  const current = { utcDay: today, dayCount, windowStart, windowCount };
  if (dayCount >= limits.perUtcDay || windowCount >= limits.perWindow) {
    return { allowed: false, state: current };
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
