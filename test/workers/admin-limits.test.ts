import { describe, expect, it } from "vitest";
import { allowedMethods } from "../../admin-worker/app";
import { adminEnv, adminRequest, json } from "./helpers";

function fakeLimiter(success: boolean) {
  const keys: string[] = [];
  const limiter: RateLimit = {
    limit({ key }) {
      keys.push(key);
      return Promise.resolve({ success });
    },
  };
  return { limiter, keys };
}

describe("admin API: unsupported methods (ADR-015)", () => {
  it.each([
    ["DELETE", "/api/admin/countries/1", "PUT"],
    ["DELETE", "/api/admin/destinations/1", "GET, HEAD, PUT"],
    ["PATCH", "/api/admin/settings", "GET, HEAD, PUT"],
    ["PUT", "/api/admin/destinations", "GET, HEAD, POST"],
    ["POST", "/api/admin/me", "GET, HEAD"],
  ])("answers %s %s with 405 and Allow: %s", async (method, path, allow) => {
    const response = await adminRequest(path, { method, body: {} });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe(allow);
    expect(await json(response)).toEqual({ error: "method_not_allowed" });
  });

  it("serves HEAD wherever GET is allowed, as advertised in Allow", async () => {
    const response = await adminRequest("/api/admin/destinations", { method: "HEAD" });
    expect(response.status).toBe(200);
  });

  it("keeps 404 for unknown admin paths", async () => {
    const response = await adminRequest("/api/admin/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("answers 403, not 405, without a valid token, so routes cannot be probed", async () => {
    const response = await adminRequest("/api/admin/destinations/1", { method: "DELETE", body: {}, token: null });
    expect(response.status).toBe(403);
    expect(response.headers.get("Allow")).toBeNull();
  });

  it("lists methods per concrete path, ignoring middleware entries", () => {
    const routes = [
      { method: "ALL", path: "/api/admin/*" },
      { method: "GET", path: "/api/admin/questions/:id" },
      { method: "PUT", path: "/api/admin/questions/:id" },
      { method: "GET", path: "/api/admin/questions" },
    ];
    expect(allowedMethods(routes, "/api/admin/questions/12")).toEqual(["GET", "HEAD", "PUT"]);
    expect(allowedMethods(routes, "/api/admin/questions/12/extra")).toEqual([]);
    expect(allowedMethods(routes, "/api/admin/other")).toEqual([]);
  });
});

describe("admin API: per-identity rate limiting (ADR-020)", () => {
  it("returns 429 when the limiter refuses, keyed by the Access email", async () => {
    const { limiter, keys } = fakeLimiter(false);
    const response = await adminRequest("/api/admin/me", { env: adminEnv({ ADMIN_RATE_LIMITER: limiter }) });
    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({ error: "rate_limited" });
    expect(keys).toEqual(["admin:owner@example.test"]);
  });

  it("passes requests within the limit", async () => {
    const { limiter, keys } = fakeLimiter(true);
    const response = await adminRequest("/api/admin/me", { env: adminEnv({ ADMIN_RATE_LIMITER: limiter }) });
    expect(response.status).toBe(200);
    expect(keys).toHaveLength(1);
  });

  it("does not consult the limiter for unauthenticated requests", async () => {
    const { limiter, keys } = fakeLimiter(false);
    const response = await adminRequest("/api/admin/me", { token: null, env: adminEnv({ ADMIN_RATE_LIMITER: limiter }) });
    expect(response.status).toBe(403);
    expect(keys).toEqual([]);
  });

  it("works without a limiter binding", async () => {
    const response = await adminRequest("/api/admin/me");
    expect(response.status).toBe(200);
  });
});
