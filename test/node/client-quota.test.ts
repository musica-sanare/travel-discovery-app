/** Strict per-client AI quota (docs/working/DECISIONS.md ADR-029). */
import { describe, expect, it } from "vitest";
import {
  AI_CLIENT_QUOTA,
  AI_GLOBAL_DAILY_CAP,
  applyGlobalCap,
  applyQuota,
  clientObjectName,
  GLOBAL_OBJECT_NAME,
  nextUtcMidnight,
  type QuotaState,
} from "../../server/public/client-quota";

const limits = { windowMs: 60_000, perWindow: 5, perUtcDay: 30 };
const DAY = 86_400_000;
const noon = 20_000 * DAY + 12 * 3_600_000;

function run(times: number[], start: QuotaState | null = null) {
  let state = start;
  return times.map((now) => {
    const result = applyQuota(state, now, limits);
    state = result.state;
    return result.allowed;
  });
}

describe("applyQuota", () => {
  it("uses the documented limits", () => {
    expect(AI_CLIENT_QUOTA).toEqual(limits);
  });

  it("allows five requests in a window and refuses the rest of it", () => {
    expect(run([0, 1, 2, 3, 4, 5, 59_999].map((offset) => noon + offset))).toEqual([true, true, true, true, true, false, false]);
  });

  it("opens a new window 60 s after its first request", () => {
    expect(run([0, 1, 2, 3, 4, 60_000].map((offset) => noon + offset))).toEqual([true, true, true, true, true, true]);
  });

  it("does not count refused requests", () => {
    const first = applyQuota(null, noon, { ...limits, perWindow: 1 });
    const refused = applyQuota(first.state, noon + 1, { ...limits, perWindow: 1 });
    expect(refused.allowed).toBe(false);
    expect(refused.state).toEqual(first.state);
  });

  it("refuses the 31st request of a UTC day, however the requests are spread", () => {
    const times = Array.from({ length: 31 }, (_, index) => noon + index * 61_000);
    const allowed = run(times);
    expect(allowed.slice(0, 30).every(Boolean)).toBe(true);
    expect(allowed[30]).toBe(false);
  });

  it("resets the day count at 00:00 UTC", () => {
    const full: QuotaState = { utcDay: 20_000, dayCount: 30, windowStart: 0, windowCount: 0 };
    expect(applyQuota(full, 20_001 * DAY - 1, limits).allowed).toBe(false);
    const next = applyQuota(full, 20_001 * DAY, limits);
    expect(next.allowed).toBe(true);
    expect(next.state).toEqual({ utcDay: 20_001, dayCount: 1, windowStart: 20_001 * DAY, windowCount: 1 });
  });

  it("stores counts and times only", () => {
    expect(Object.keys(applyQuota(null, noon, limits).state).sort()).toEqual(["dayCount", "utcDay", "windowCount", "windowStart"]);
  });
});

describe("nextUtcMidnight", () => {
  it("returns the start of the next UTC day", () => {
    expect(nextUtcMidnight(noon)).toBe(20_001 * DAY);
    expect(nextUtcMidnight(20_001 * DAY)).toBe(20_002 * DAY);
  });
});

describe("clientObjectName", () => {
  it("is a stable SHA-256 hex digest that does not contain the key", async () => {
    const name = await clientObjectName("ip4:203.0.113.5");
    expect(name).toMatch(/^[0-9a-f]{64}$/);
    expect(await clientObjectName("ip4:203.0.113.5")).toBe(name);
    expect(await clientObjectName("ip4:203.0.113.6")).not.toBe(name);
    expect(name).not.toContain("ip4:");
  });
});

describe("applyQuota refusals", () => {
  it("reports the window limit with the end of the window", () => {
    const state: QuotaState = { utcDay: 20_000, dayCount: 5, windowStart: noon, windowCount: 5 };
    expect(applyQuota(state, noon + 17_000, limits)).toMatchObject({ allowed: false, refusal: { limit: "window", retryAt: noon + 60_000 } });
  });

  it("reports the daily limit with the next 00:00 UTC, also when the window is full", () => {
    const full: QuotaState = { utcDay: 20_000, dayCount: 30, windowStart: noon, windowCount: 5 };
    expect(applyQuota(full, noon + 1, limits)).toMatchObject({ allowed: false, refusal: { limit: "daily", retryAt: 20_001 * DAY } });
  });
});

describe("applyGlobalCap", () => {
  it("uses the owner-approved cap of 500 model calls per UTC day", () => {
    expect(AI_GLOBAL_DAILY_CAP).toBe(500);
  });

  it("allows the cap, refuses the next call until 00:00 UTC without counting it, and resets then", () => {
    const full = { utcDay: 20_000, count: 499 };
    const last = applyGlobalCap(full, noon, 500);
    expect(last).toEqual({ allowed: true, state: { utcDay: 20_000, count: 500 } });
    const refused = applyGlobalCap({ utcDay: 20_000, count: 500 }, noon + 1, 500);
    expect(refused).toEqual({ allowed: false, retryAt: 20_001 * DAY });
    expect(applyGlobalCap({ utcDay: 20_000, count: 500 }, 20_001 * DAY, 500)).toEqual({ allowed: true, state: { utcDay: 20_001, count: 1 } });
  });

  it("starts from zero without state", () => {
    expect(applyGlobalCap(null, noon, 500)).toEqual({ allowed: true, state: { utcDay: 20_000, count: 1 } });
  });

  it("has an object name that no client object name can take", async () => {
    expect(GLOBAL_OBJECT_NAME).not.toMatch(/^[0-9a-f]{64}$/);
    expect(await clientObjectName("unknown")).not.toBe(GLOBAL_OBJECT_NAME);
  });
});
