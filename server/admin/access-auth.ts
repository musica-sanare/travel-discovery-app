/**
 * Admin request authorization (docs/DECISIONS.md, ADR-004).
 *
 * Cloudflare Access protects every URL of the admin Worker at the edge, and
 * this module independently verifies the Access JWT on every admin API request
 * (`ctx.access` is not available to Workers with static assets). Any failure,
 * including missing configuration, results in 403 (fail closed).
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

export interface AccessConfig {
  /** e.g. `https://<team>.cloudflareaccess.com` */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the admin Access application. */
  ACCESS_POLICY_AUD?: string;
}

export interface AdminIdentity {
  email: string;
  source: "access" | "local-dev";
}

export interface AuthOptions {
  /** Resolves signing keys; defaults to the team's remote JWKS. */
  getKey?: JWTVerifyGetKey;
  /**
   * Local development only. The admin Worker entry passes this solely under
   * `import.meta.env.DEV`, so production builds contain no such path.
   */
  resolveDevIdentity?: ((env: object) => AdminIdentity | undefined) | undefined;
}

const TEAM_DOMAIN_PATTERN = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function remoteKeySet(teamDomain: string): JWTVerifyGetKey {
  let keySet = remoteKeySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    remoteKeySets.set(teamDomain, keySet);
  }
  return keySet;
}

/** Returns the verified identity, or `null` if the request must be rejected. */
export async function authenticateAdmin(
  request: Request,
  config: AccessConfig,
  options: AuthOptions,
): Promise<AdminIdentity | null> {
  const devIdentity = options.resolveDevIdentity?.(config);
  if (devIdentity) {
    return devIdentity;
  }

  const teamDomain = config.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, "");
  const audience = config.ACCESS_POLICY_AUD;
  if (!teamDomain || !TEAM_DOMAIN_PATTERN.test(teamDomain) || !audience) {
    return null;
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, options.getKey ?? remoteKeySet(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
      // jose only checks `exp` when present; tokens must never be non-expiring.
      requiredClaims: ["exp"],
    });
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return email ? { email, source: "access" } : null;
  } catch {
    return null;
  }
}

/**
 * Rejects cross-origin browser requests to state-changing endpoints. Requests
 * without an Origin header (non-browser clients) still need a valid JWT.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || origin === new URL(request.url).origin;
}
