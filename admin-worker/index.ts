/**
 * Admin Worker entry. Only `/api/*` requests invoke this Worker; the admin SPA
 * is served as static assets. Every URL of this Worker must be protected by
 * Worker-level Cloudflare Access (configured in the dashboard; ADR-004).
 */
import { createAdminApp, type AdminEnv } from "./app";
import { localDevIdentity } from "./local-dev-identity";

// `import.meta.env.DEV` is replaced at build time: production builds drop the
// local-development identity entirely (checked by scripts/verify-bundles.mjs).
const app = createAdminApp({
  resolveDevIdentity: import.meta.env.DEV ? localDevIdentity : undefined,
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<AdminEnv>;
