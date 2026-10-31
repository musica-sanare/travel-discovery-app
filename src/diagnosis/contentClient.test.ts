import { describe, expect, it, vi } from "vitest";
import type { Locale } from "../../shared/locales";
import { createContentCache, CONTENT_MAX_AGE_MS, fetchDiagnosisContent } from "./contentClient";
import { testContent } from "./testContent";

function respond(body: unknown, init: ResponseInit = {}): typeof fetch {
  return () => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), init));
}

describe("fetchDiagnosisContent", () => {
  it("requests the locale and returns validated content", async () => {
    const fetchImpl = vi.fn(respond(testContent("es")));
    const result = await fetchDiagnosisContent("es", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/diagnosis-content?locale=es", expect.anything());
    expect(result).toEqual({ ok: true, content: testContent("es") });
  });

  it.each([
    ["an error status", respond({ error: "service_unavailable" }, { status: 503 })],
    ["a non-JSON body (platform error page)", respond("<html>Error 1027</html>", { status: 200 })],
    ["an unexpected shape", respond({ items: [] })],
    ["a different locale", respond(testContent("en"))],
  ])("reports %s as unavailable", async (_, fetchImpl) => {
    expect(await fetchDiagnosisContent("ja", fetchImpl)).toEqual({ ok: false, error: "unavailable" });
  });

  it("reports network failures", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await fetchDiagnosisContent("ja", fetchImpl)).toEqual({ ok: false, error: "network" });
  });

  it("propagates aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl: typeof fetch = () => Promise.reject(new DOMException("Aborted", "AbortError"));
    await expect(fetchDiagnosisContent("ja", fetchImpl, controller.signal)).rejects.toThrow("Aborted");
  });
});

describe("createContentCache", () => {
  it("reuses a snapshot for up to five minutes per locale, then refetches", async () => {
    let now = 0;
    const load = vi.fn((locale: Locale) => Promise.resolve({ ok: true as const, content: testContent(locale) }));
    const cache = createContentCache(load, () => now);
    await cache.get("ja");
    now = CONTENT_MAX_AGE_MS - 1;
    await cache.get("ja");
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get("en");
    expect(load).toHaveBeenCalledTimes(2);
    now = CONTENT_MAX_AGE_MS;
    await cache.get("ja");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not cache failures", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "network" })
      .mockResolvedValueOnce({ ok: true, content: testContent() });
    const cache = createContentCache(load, () => 0);
    expect(await cache.get("ja")).toEqual({ ok: false, error: "network" });
    expect(await cache.get("ja")).toEqual({ ok: true, content: testContent() });
  });
});
