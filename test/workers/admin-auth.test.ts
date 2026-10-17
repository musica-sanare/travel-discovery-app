import { describe, expect, it } from "vitest";
import { createAdminApp, type AdminEnv } from "../../admin-worker/app";
import { localDevIdentity } from "../../admin-worker/local-dev-identity";
import { ACCESS_JWT_HEADER } from "../../server/admin/access-auth";
import {
  ADMIN_ORIGIN,
  adminApp,
  adminEnv,
  adminRequest,
  json,
  localKeySet,
  signAccessToken,
} from "./helpers";

/** Every registered admin route, taken from the app itself. */
const routes = adminApp.routes
  .filter((route) => route.method !== "ALL")
  .map((route) => ({ method: route.method, path: route.path.replace(":id", "1") }));

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function bodyFor(method: string) {
  return MUTATING.has(method) ? {} : undefined;
}

describe("admin route inventory", () => {
  it("covers all admin API routes, and every route is under /api/admin", () => {
    expect(routes.length).toBeGreaterThanOrEqual(20);
    for (const route of routes) {
      expect(route.path.startsWith("/api/admin/")).toBe(true);
    }
  });
});

describe("admin authorization", () => {
  const rejectedTokens: [string, () => Promise<string | null>][] = [
    ["missing token", () => Promise.resolve(null)],
    ["malformed token", () => Promise.resolve("not-a-jwt")],
    ["wrong audience", () => signAccessToken({ audience: "other-aud" })],
    ["wrong issuer", () => signAccessToken({ issuer: "https://other-team.cloudflareaccess.com" })],
    ["expired token", () => signAccessToken({ expiresIn: "-1m" })],
    ["untrusted signing key", () => signAccessToken({ useOtherKey: true })],
    ["token without email", () => signAccessToken({ omitEmail: true })],
    ["token without exp", () => signAccessToken({ omitExp: true })],
  ];

  for (const [label, makeToken] of rejectedTokens) {
    it.each(routes)(`rejects ${label}: $method $path`, async ({ method, path }) => {
      const response = await adminRequest(path, { method, body: bodyFor(method), token: await makeToken() });
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: "forbidden" });
    });
  }

  it.each(routes)("fails closed without Access configuration: $method $path", async ({ method, path }) => {
    const env = adminEnv();
    delete env.ACCESS_POLICY_AUD;
    const response = await adminRequest(path, { method, body: bodyFor(method), env });
    expect(response.status).toBe(403);
  });

  it("fails closed when the team domain is not a cloudflareaccess.com URL", async () => {
    const response = await adminRequest("/api/admin/me", {
      env: adminEnv({ ACCESS_TEAM_DOMAIN: "https://attacker.example" }),
    });
    expect(response.status).toBe(403);
  });

  it.each(routes.filter((route) => MUTATING.has(route.method)))(
    "rejects cross-origin mutations even with a valid token: $method $path",
    async ({ method, path }) => {
      const response = await adminRequest(path, { method, body: {}, origin: "https://evil.example" });
      expect(response.status).toBe(403);
    },
  );

  it("accepts a valid Access token and exposes the verified email", async () => {
    const response = await adminRequest("/api/admin/me");
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ email: "owner@example.test" });
  });

  it("ignores ADMIN_DEV_IDENTITY_EMAIL unless the dev identity resolver is enabled", async () => {
    const env: AdminEnv = adminEnv();
    Object.assign(env, { ADMIN_DEV_IDENTITY_EMAIL: "dev@example.test" });
    const response = await adminRequest("/api/admin/me", { token: null, env });
    expect(response.status).toBe(403);
  });

  it("uses the local dev identity only when the resolver is passed (dev builds)", async () => {
    const devApp = createAdminApp({ getKey: localKeySet, resolveDevIdentity: localDevIdentity });
    const env: AdminEnv = adminEnv();
    Object.assign(env, { ADMIN_DEV_IDENTITY_EMAIL: "dev@example.test" });
    const response = await devApp.fetch(new Request(`${ADMIN_ORIGIN}/api/admin/me`), env);
    expect(await json(response)).toEqual({ email: "dev@example.test" });

    const withoutEmail = await devApp.fetch(new Request(`${ADMIN_ORIGIN}/api/admin/me`), adminEnv());
    expect(withoutEmail.status).toBe(403);
  });

  it("does not trust the CF_Authorization cookie on its own", async () => {
    const token = await signAccessToken();
    const response = await adminApp.fetch(
      new Request(`${ADMIN_ORIGIN}/api/admin/me`, { headers: { Cookie: `CF_Authorization=${token}` } }),
      adminEnv(),
    );
    expect(response.status).toBe(403);
    expect(ACCESS_JWT_HEADER).toBe("Cf-Access-Jwt-Assertion");
  });

  it("returns JSON 404 for unknown admin paths after authentication", async () => {
    const response = await adminRequest("/api/admin/unknown");
    expect(response.status).toBe(404);
  });
});
