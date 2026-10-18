# Deployment Runbook (draft)

**Status: draft (Phase 5f, 2026-10-18). Nothing in this document has been executed.** No Cloudflare resource, Access application, or deployment exists. Every step that creates resources, changes account settings, or deploys requires the owner's explicit approval at that time. Steps marked *(verify)* rely on commands or behaviour not yet checked against current official documentation; Phase 6 verifies and finalizes them.

## 1. Target setup

| | Public Worker `travel-discovery` | Admin Worker `travel-discovery-admin` |
|---|---|---|
| Serves | Public SPA, read-only API, AI explanation endpoint | Admin SPA and admin API |
| Protection | None (public site) | Worker-level Cloudflare Access ("All traffic") plus JWT validation in every admin API handler (ADR-004) |
| D1 | Same database as the admin Worker, read-only by code (ADR-018) | Owns migrations |
| Optional bindings | `AI`, `AI_CLIENT_RATE_LIMITER` (ADR-026) | `ADMIN_RATE_LIMITER` (ADR-020) |

Environments: `preview` (for verification) and `production`, each with its own D1 database. The top-level configuration stays local-only; `env.e2e` in `wrangler.admin.jsonc` is for local tests and must never be deployed.

## 2. Approvals needed before the first deployment

1. Creating the preview and production D1 databases.
2. Enabling Cloudflare Zero Trust (Free plan; confirm login methods and seat limits in the dashboard) and creating the Access policy for the admin Worker.
3. The configuration change C5 (named environments, below).
4. Each deployment, starting with `preview`.
5. Enabling AI later is a separate decision (section 7).

## 3. One-time setup

### 3.1 D1 databases *(verify commands)*
- Create one database per environment, for example `travel-discovery-preview` and `travel-discovery-production` (`wrangler d1 create <name>`), and record each `database_id`.
- Do not reuse the local placeholder `local-travel-discovery`; a deployment with it fails rather than touching another database (ADR-018).

### 3.2 Configuration (C5, ADR-026 "Stage 5 preparation decisions" C)
Add `env.preview` and `env.production` to both Wrangler configs. Bindings and `vars` are not inherited by named environments, so each environment declares everything it uses:
- Both Workers: `d1_databases` with that environment's `database_id` (the admin config also keeps `migrations_dir`), `"observability": { "enabled": true }` (Workers Logs on Free: 200,000 events/day, 3-day retention).
- Public Worker: `ai` binding, `vars` `AI_ASSIST_ENABLED: "false"` and `AI_MODEL: "@cf/google/gemma-4-26b-a4b-it"`, and a `ratelimits` binding `AI_CLIENT_RATE_LIMITER` (5 requests per 60 s; `namespace_id` unique in the account).
- Admin Worker: a `ratelimits` binding `ADMIN_RATE_LIMITER` (suggested 120 requests per 60 s) with its own `namespace_id`, and `vars` `ACCESS_TEAM_DOMAIN` and `ACCESS_POLICY_AUD` (not secrets; known after 3.3).
- Keep `"preview_urls": false` in both configs.
- Never add `ai`, `ratelimits`, or AI variables to the top level: an `ai` binding always connects to Cloudflare, also from `npm run dev` and the tests.

### 3.3 Cloudflare Access for the admin Worker
- Enable Worker-level Access with scope "All traffic" on `travel-discovery-admin`, with a policy that allows only the owner's identity.
- Copy the team domain (`https://<team>.cloudflareaccess.com`) and the application audience (AUD) tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_POLICY_AUD` for that environment. Without them every admin API request is answered with 403 (fail closed).
- Do not create hostname or path Access applications with a Bypass policy that match admin hostnames (ADR-004 invariant 4).

### 3.4 Secrets
The Workers currently need no secrets: the AI binding needs none, and the Access values are not secret. If a secret is added later, set it with `wrangler secret put <NAME> --env <environment>` or in the dashboard; never in files, `.dev.vars`, or `.env` that could be copied or committed.

## 4. Database migrations *(verify flags)*
- Migrations are applied only through the admin config, preview first: `wrangler d1 migrations apply <database> --remote --env preview --config wrangler.admin.jsonc`, then the same for `production` after the preview checks pass.
- Before applying to production, make sure a restore point exists: D1 Time Travel keeps 7 days on Workers Free (verified 2026-10-17); an export (`wrangler d1 export`) is an additional option *(verify)*.
- `db/seed/dev.sql` is local test data. Production content is entered through the admin console.

## 5. Build and deploy *(verify the deploy command)*
1. Remove any `.dev.vars` from the build machine or make sure it holds only local test values: the build copies it into `dist/` and `dist-admin/` (docs/DEVELOPMENT.md).
2. Run `npm ci` and `npm run check` on the commit to deploy.
3. Build per environment; `CLOUDFLARE_ENV` is read at build time and ignored by `wrangler deploy`, and the build writes a configuration flattened to that environment:
   - `CLOUDFLARE_ENV=preview npx vite build`
   - `CLOUDFLARE_ENV=preview npx vite build --config vite.admin.config.ts`
4. Deploy each Worker from its build output with Wrangler, preview first.
5. Run section 6, then repeat with `production`.

## 6. Checks after each deployment
From "Admin authentication status" and the verification logs in `docs/DECISIONS.md`, these can only be checked on a deployed Worker:
- Every admin URL (`workers.dev`, routes, custom domains) redirects to the Access login when not signed in; the admin static assets are not reachable without login.
- After login, the admin API accepts the request: the `Cf-Access-Jwt-Assertion` header reaches the Worker through the static-assets router and the token validates (RS256, issuer, audience).
- Version URLs are disabled for both Workers.
- The public and admin Workers see the same D1 data (publish in admin, then check the public API).
- The public site works end to end in `ja`, `en`, and `es`; the AI toggle shows the "unavailable" notice while AI is disabled.
- The Rate Limiting bindings deploy without errors (availability on the account is unconfirmed, ADR-026).
- Workers Logs shows the AI endpoint's `disabled` outcome lines without addresses or answers.

## 7. Enabling AI (separate approval)
Preconditions (ADR-026 A): the account stays on Workers Free while AI is enabled; the per-client limiter is active; Workers Logs is enabled; the owner has reviewed the Gemma terms of use and prohibited-use policy.
1. In the environment's `vars`, set `AI_ASSIST_ENABLED: "true"`, rebuild, and redeploy.
2. Check the AI notes in all three languages and the Workers AI usage in the dashboard.
3. Monitoring and stopping: ADR-026 E. To stop, set `AI_ASSIST_ENABLED` back to `"false"` and redeploy; the diagnosis keeps working.

## 8. Rollback
- Code: redeploy the build of the previous good commit (Workers version rollback in the dashboard or Wrangler is an alternative *(verify)*).
- Data: D1 Time Travel restores a database to a point within the retention window *(verify the procedure before relying on it)*.
- AI problems: use the kill switch (section 7) instead of a rollback.

## 9. Free-tier assumptions (re-check before deploying)
Checked on the dates given in `docs/DECISIONS.md`; free tiers and limits change.
- Workers Free: 100,000 requests/day (Error 1027 when exceeded), 10 ms CPU per request. Static asset requests are free and do not count. https://developers.cloudflare.com/workers/platform/limits/
- D1 Free: 5 million rows read and 100,000 rows written per day, 500 MB per database, 7-day Time Travel. https://developers.cloudflare.com/d1/platform/pricing/
- Workers AI: 10,000 Neurons/day free; on Workers Free, usage fails after that without charge. https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers Logs: 200,000 events/day, 3-day retention on Free. https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Cloudflare Zero Trust Free: confirm in the dashboard.

## 10. Manual checks before the first deployment (owner)
- [ ] `npm run check` and `npm run test:e2e` pass on the commit to deploy; CI is green on GitHub after the push.
- [ ] `git status` is clean; no `.dev.vars`, `.env`, `.ai-eval/`, or `dist*/` content is committed.
- [ ] Keyboard-only run through the public quiz and the admin destination form in Chrome, with visible focus.
- [ ] Screen-reader spot check (VoiceOver) of the quiz, results, and language switcher.
- [ ] Light and dark mode, and 200% zoom, on a phone-sized and a desktop window.
- [ ] Reduced-motion setting: no blocking animation.
- [ ] Content review: costs show basis, source, and date; no wording suggests live prices; all published content has `ja` and `en` translations at least.
- [ ] Outbound search links open the provider start pages only, in a new tab.
- [ ] The evaluation API token from Stage 5 has been deleted in the dashboard.
- [ ] The Gemma terms of use and prohibited-use policy have been reviewed (before enabling AI).
- [ ] Commit author emails are acceptable for the intended visibility of the repository.
