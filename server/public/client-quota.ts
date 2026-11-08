/**
 * Strict per-client quota and app-wide daily cap for AI explanations
 * (docs/working/DECISIONS.md ADR-029). One Durable Object per rate-limit key
 * applies the per-client rules, so every request of a client is counted in
 * one place, whatever connection or Cloudflare location it arrives on. One
 * more object of the same class, with a fixed name, counts the model calls of
 * all clients together.
 */
import type { AiRateLimit, QuotaLimits } from "../../shared/ai-quota";

export { AI_CLIENT_QUOTA, AI_GLOBAL_DAILY_CAP } from "../../shared/ai-quota";

/**
 * Name of the app-wide cap object. Client object names are 64 hex digits
 * (clientObjectName), so this name can never be a client's.
 */
export const GLOBAL_OBJECT_NAME = "ai-global:v1";

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

/** Count of model calls on one UTC day, for the app-wide cap; no client data. */
export interface GlobalCapState {
  utcDay: number;
  count: number;
}

/** Result of one app-wide cap check; a refusal lasts until the next 00:00 UTC. */
export type GlobalDecision = { success: true } | { success: false; retryAt: number };

/** Like applyQuota, a refused call is not counted, so a refusal needs no storage write. */
export function applyGlobalCap(
  state: GlobalCapState | null,
  nowMs: number,
  cap: number,
): { allowed: true; state: GlobalCapState } | { allowed: false; retryAt: number } {
  const today = utcDay(nowMs);
  const count = state !== null && state.utcDay === today ? state.count : 0;
  if (count >= cap) {
    return { allowed: false, retryAt: nextUtcMidnight(nowMs) };
  }
  return { allowed: true, state: { utcDay: today, count: count + 1 } };
}
