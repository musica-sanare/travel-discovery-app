import { describe, expect, it, vi } from "vitest";
import type { AiExplanationRequest } from "../../shared/ai-explanation";
import type { RankingResult } from "../../domain/diagnosis";
import { fetchAiExplanations } from "./aiClient";
import { buildAiRequest } from "./useAiExplanations";

const REQUEST: AiExplanationRequest = {
  locale: "ja",
  answers: [{ question: "pace", options: ["relaxed"] }],
  constraints: {},
  expected: ["lisbon", "iceland"],
};
const TEXT = "ゆったりとした街歩きと豊かな食文化があり、好みに合いそうです。";

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));
}

describe("fetchAiExplanations", () => {
  it("posts the request as JSON to the same-origin endpoint and returns texts by slug", async () => {
    const fetchImpl = respond({ explanations: [{ slug: "iceland", text: TEXT }, { slug: "lisbon", text: TEXT }] });
    const result = await fetchAiExplanations(REQUEST, fetchImpl);
    expect(result).toEqual({ ok: true, texts: new Map([["iceland", TEXT], ["lisbon", TEXT]]) });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("/api/ai/explanations");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toEqual(REQUEST);
  });

  it("ignores texts for slugs that are not displayed", async () => {
    const result = await fetchAiExplanations(
      REQUEST,
      respond({ explanations: [{ slug: "lisbon", text: TEXT }, { slug: "atlantis", text: TEXT }] }),
    );
    expect(result).toEqual({ ok: true, texts: new Map([["lisbon", TEXT]]) });
  });

  it.each([
    [409, "content_changed"],
    [429, "rate_limited"],
    [503, "unavailable"],
    [500, "unavailable"],
    [400, "unavailable"],
  ] as const)("maps status %i to %s", async (status, reason) => {
    expect(await fetchAiExplanations(REQUEST, respond({ error: "x" }, status))).toEqual({ ok: false, reason });
  });

  it("tells the window limit from the daily limit and keeps the daily reset time", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 31, 19, 0, 0, 400), toFake: ["Date"] });
    try {
      expect(await fetchAiExplanations(REQUEST, respond({ error: "rate_limited", limit: "window", retryAfter: 43 }, 429))).toEqual({
        ok: false,
        reason: "rate_limited_window",
      });
      // 5 h to 00:00 UTC; the reset is rounded to the whole minute.
      expect(await fetchAiExplanations(REQUEST, respond({ error: "rate_limited", limit: "daily", retryAfter: 18_000 }, 429))).toEqual({
        ok: false,
        reason: "rate_limited_daily",
        retryAt: Date.UTC(2026, 10, 1, 0, 0, 0),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["no body", ""],
    ["an unknown limit", { error: "rate_limited", limit: "hourly", retryAfter: 60 }],
    ["a wait over one day", { error: "rate_limited", limit: "daily", retryAfter: 90_000 }],
  ])("reports a 429 with %s as a generic limit", async (_, body) => {
    expect(await fetchAiExplanations(REQUEST, respond(body, 429))).toEqual({ ok: false, reason: "rate_limited" });
  });

  it.each([
    ["non-JSON", "<html>Error 1027</html>"],
    ["an unexpected shape", { explanations: "text" }],
    ["text over the limit", { explanations: [{ slug: "lisbon", text: "x".repeat(401) }] }],
    ["only unknown slugs", { explanations: [{ slug: "atlantis", text: TEXT }] }],
    ["extra entries", { explanations: Array.from({ length: 6 }, () => ({ slug: "lisbon", text: TEXT })) }],
  ])("reports %s as unavailable", async (_, body) => {
    expect(await fetchAiExplanations(REQUEST, respond(body))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports network errors as unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchAiExplanations(REQUEST, fetchImpl)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("times out as unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    expect(await fetchAiExplanations(REQUEST, fetchImpl, undefined, 10)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects when the caller aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const pending = fetchAiExplanations(REQUEST, fetchImpl, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("buildAiRequest", () => {
  const ranking = (slugs: string[]): RankingResult => ({
    results: slugs.map((slug, index) => ({
      slug,
      rank: index + 1,
      fit: 60,
      displayFit: 60,
      coverage: 1,
      budget: { status: "not_applicable" },
      season: "not_applicable",
      duration: "not_applicable",
      topAttributes: [],
    })),
    excluded: [],
    notices: [],
    ignoredAnswers: [],
  });

  it("sends answers, constraints, and displayed slugs only; no scores or ranks", () => {
    const request = buildAiRequest(
      "es",
      [{ question: "pace", options: ["relaxed"] }, { question: "interest", options: [] }],
      { days: 4, months: [4, 5], budget: { amount: 200000, currency: "JPY" } },
      ranking(["lisbon", "iceland"]),
    );
    expect(request).toEqual({
      locale: "es",
      answers: [{ question: "pace", options: ["relaxed"] }, { question: "interest", options: [] }],
      constraints: { days: 4, months: [4, 5], budget: { amount: 200000, currency: "JPY" } },
      expected: ["lisbon", "iceland"],
    });
  });

  it("omits unset constraints and returns null when there is nothing to explain", () => {
    expect(buildAiRequest("ja", [{ question: "pace", options: [] }], {}, ranking(["lisbon"]))?.constraints).toEqual({});
    expect(buildAiRequest("ja", [], {}, ranking(["lisbon"]))).toBeNull();
    expect(buildAiRequest("ja", [{ question: "pace", options: [] }], {}, ranking([]))).toBeNull();
  });
});
