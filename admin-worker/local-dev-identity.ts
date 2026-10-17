import type { AdminIdentity } from "../server/admin/access-auth";

/**
 * Local development identity, read from `ADMIN_DEV_IDENTITY_EMAIL` in the
 * git-ignored `.dev.vars`. Referenced only behind `import.meta.env.DEV`, so it
 * is removed from production builds (verified by scripts/verify-bundles.mjs).
 */
export function localDevIdentity(env: object): AdminIdentity | undefined {
  const email: unknown = Reflect.get(env, "ADMIN_DEV_IDENTITY_EMAIL");
  return typeof email === "string" && email.includes("@")
    ? { email, source: "local-dev" }
    : undefined;
}
