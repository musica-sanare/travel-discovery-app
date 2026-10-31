import { describe, expect, it, vi } from "vitest";
import { fetchAiStatus } from "./aiStatus";

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));
}

describe("fetchAiStatus", () => {
  it("reads the site status from the same-origin endpoint", async () => {
    const fetchImpl = respond({ enabled: true });
    expect(await fetchAiStatus(fetchImpl)).toBe("on");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/ai/status");
    expect(await fetchAiStatus(respond({ enabled: false }))).toBe("off");
  });

  it.each([
    ["an error status", respond({ error: "internal_error" }, 500)],
    ["non-JSON", respond("<html>Error 1027</html>")],
    ["an unexpected shape", respond({ enabled: "yes" })],
    ["a network error", vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")))],
  ])("reports %s as unknown, which leaves the toggle usable", async (_, fetchImpl) => {
    expect(await fetchAiStatus(fetchImpl)).toBe("unknown");
  });

  it("rejects when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new DOMException("Aborted", "AbortError")));
    await expect(fetchAiStatus(fetchImpl, controller.signal)).rejects.toThrow();
  });
});
