import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./index";

describe("handleApiRequest", () => {
  it("returns ok for GET /api/health", async () => {
    const response = handleApiRequest(new Request("https://example.test/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("accepts HEAD on /api/health", () => {
    const response = handleApiRequest(
      new Request("https://example.test/api/health", { method: "HEAD" }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects non-GET methods on /api/health", () => {
    const response = handleApiRequest(
      new Request("https://example.test/api/health", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("returns a JSON 404 for unknown API paths", async () => {
    const response = handleApiRequest(new Request("https://example.test/api/unknown"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it.each(["/api/health", "/api/unknown"])("sets no-store and nosniff headers on %s", (path) => {
    const response = handleApiRequest(new Request(`https://example.test${path}`));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
