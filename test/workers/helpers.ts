import { env } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { createAdminApp, type AdminEnv } from "../../admin-worker/app";
import { ACCESS_JWT_HEADER } from "../../server/admin/access-auth";
import { app as publicApp } from "../../worker/index";

export const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
export const AUDIENCE = "test-admin-aud";
export const ADMIN_ORIGIN = "https://admin.example.test";

const signingKeys = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");
const publicJwk: JWK = { ...(await exportJWK(signingKeys.publicKey)), kid: "test-key", alg: "RS256" };
export const localKeySet = createLocalJWKSet({ keys: [publicJwk] });

export interface TokenOptions {
  issuer?: string;
  audience?: string;
  email?: string;
  omitEmail?: boolean;
  expiresIn?: string;
  omitExp?: boolean;
  useOtherKey?: boolean;
}

/** Signs an Access-like JWT with the test key (or an untrusted key). */
export async function signAccessToken(options: TokenOptions = {}): Promise<string> {
  const claims = options.omitEmail ? {} : { email: options.email ?? "owner@example.test" };
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? TEAM_DOMAIN)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt();
  if (!options.omitExp) {
    builder.setExpirationTime(options.expiresIn ?? "5m");
  }
  return builder.sign(options.useOtherKey ? otherKeys.privateKey : signingKeys.privateKey);
}

export const adminApp = createAdminApp({ getKey: localKeySet });

export function adminEnv(overrides: Partial<AdminEnv> = {}): AdminEnv {
  return {
    ADMIN_DB: env.ADMIN_DB,
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_POLICY_AUD: AUDIENCE,
    ...overrides,
  };
}

export interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  origin?: string | null;
  contentType?: string;
  env?: AdminEnv;
}

/** Sends a request to the admin app; a valid token is attached by default. */
export async function adminRequest(path: string, options: AdminRequestOptions = {}): Promise<Response> {
  const headers = new Headers();
  const token = options.token === undefined ? await signAccessToken() : options.token;
  if (token !== null) headers.set(ACCESS_JWT_HEADER, token);
  if (options.origin !== null) headers.set("Origin", options.origin ?? ADMIN_ORIGIN);
  if (options.body !== undefined) headers.set("Content-Type", options.contentType ?? "application/json");
  const request = new Request(`${ADMIN_ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? null : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  return adminApp.fetch(request, options.env ?? adminEnv());
}

export function publicRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(
    publicApp.fetch(new Request(`https://public.example.test${path}`, init), { PUBLIC_DB: env.ADMIN_DB }),
  );
}

/** Applies db/seed/dev.sql once per isolated database. */
export async function ensureSeeded(): Promise<void> {
  const existing = await env.ADMIN_DB.prepare("SELECT id FROM countries WHERE slug = 'portugal'").first();
  if (existing) return;
  const statements = env.TEST_SEED_SQL.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
  await env.ADMIN_DB.batch(statements.map((statement) => env.ADMIN_DB.prepare(statement)));
}

export async function json(response: Response): Promise<unknown> {
  return response.json();
}
