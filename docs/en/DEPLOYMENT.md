English | [日本語](../ja/DEPLOYMENT.md) · [Docs index](README.md)

# Deployment Runbook

**Status (Phase 6, 2026-10-18): commands checked against current official documentation ("Phase 6 verification log" in [DECISIONS.md](../working/DECISIONS.md)).** Progress: the preview D1 database `travel-discovery-preview` was created on 2026-10-18 (region APAC) and `env.preview` (C5) is configured in both Wrangler configs with its ID; migrations `0000`–`0001` were applied and `db/seed/dev.sql` was loaded into it (owner-approved, preview only). The admin Worker `travel-discovery-admin-preview` was deployed once with `workers_dev: false` (2026-10-18, version `be458778`; Wrangler reported "No targets deployed", so it has no URL) for the Access setup in 3.4. The owner then enabled Zero Trust and Worker-level Access ("All traffic") on it, with the generated reusable policy changed to an **Emails** Include rule for the owner's address; `env.preview` of the admin config has the Access values. A deployment with `workers_dev: true` exposed the admin SPA without Access for about two minutes (the API stayed 403) and was reverted to `workers_dev: false` (incident in [DECISIONS.md](../working/DECISIONS.md) "Phase 6 verification log"; the Access scope had become "Previews only" and was set back to "All traffic"). It was then redeployed (version `8bc1cc2c`) and verified behind Access: unauthenticated requests are redirected to the Access login, and the owner signed in and used the admin UI ("Admin authentication status" in [DECISIONS.md](../working/DECISIONS.md)). The public Worker `travel-discovery-preview` was deployed on 2026-10-18 (version `ea2abe3d`, AI disabled) and passed the checks in section 6 except the Workers Logs check ("Phase 6 verification log" in [DECISIONS.md](../working/DECISIONS.md)). The production D1 database `travel-discovery-production` was created on 2026-10-18 (region APAC) and `env.production` is configured in both Wrangler configs with its ID; after recording a Time Travel bookmark of the empty database, migrations `0000`–`0001` were applied (18 tables, no content rows, no seed data). The production admin Worker `travel-discovery-admin` was deployed once with `workers_dev: false` (version `86694c6e`, "No targets deployed") for the Access setup. After the owner set up Access (All traffic, Emails policy, scope re-checked), it was redeployed with `workers_dev: true` (version `1b184825`): every checked path redirected to the Access login from the first request and for two minutes after, and the owner signed in, saw the empty admin lists, and `/api/admin/me` returned the owner's address. The public production Worker `travel-discovery` was deployed on 2026-10-18 (version `87d11262`, AI disabled) with an empty database; the same `curl` checks as for preview passed (no content yet: 0 destinations and questions). On 2026-10-24 all four Workers were redeployed with Workers Logs invocation logs disabled (preview `def4b576` / `e45a9449`, production `f73d57c0` / `07a234a3`) and passed the same checks, including the Access redirect on both admin Workers ("Phase 7 verification log" in [DECISIONS.md](../working/DECISIONS.md)). The admin Workers were redeployed with the content import (preview `3e2b9f30`, production `9d51e1a4`), and `content/initial-v1.json` was imported on preview and production on 2026-10-24: production now has 18 published destinations and 12 questions (ADR-028). Every step that logs in, creates resources, changes account settings, or deploys requires the owner's explicit approval at that time. Items marked *(要確認)* are not covered by the documentation and are confirmed at the step where they occur.

## 1. Target setup

| | Public Worker | Admin Worker |
|---|---|---|
| Config | `wrangler.jsonc` | `wrangler.admin.jsonc` |
| Serves | Public SPA, read-only API, AI explanation endpoint | Admin SPA and admin API |
| Protection | None (public site) | Worker-level Cloudflare Access ("All traffic") plus JWT validation in every admin API handler (ADR-004) |
| D1 | Same database as the admin Worker, read-only by code (ADR-018) | Owns migrations |
| Optional bindings | `AI`, `AI_CLIENT_RATE_LIMITER` (ADR-026) | `ADMIN_RATE_LIMITER` (ADR-020) |

Environments: `preview` (for verification) and `production`, each with its own D1 database. A named environment deploys as a separate Worker called `<name>-<environment>` unless the environment sets its own `name`:

| Environment | Public Worker | Admin Worker | D1 database |
|---|---|---|---|
| `preview` | `travel-discovery-preview` | `travel-discovery-admin-preview` | `travel-discovery-preview` |
| `production` | `travel-discovery` (`env.production` sets `name`; owner decision 2026-10-18) | `travel-discovery-admin` (likewise) | `travel-discovery-production` |

The Worker name determines the `workers.dev` URL (`<worker>.<account subdomain>.workers.dev`). The top-level configuration stays local-only (it is what `npm run dev`, the tests, and E2E use); `env.e2e` in `wrangler.admin.jsonc` is for local tests and must never be deployed.

## 2. Approvals needed, in order

1. Confirming the account plan in the dashboard (Workers Free; whether a payment method is attached).
2. Logging in to Cloudflare from the owner's terminal (3.1).
3. Creating each D1 database.
4. The configuration change C5 (3.3), committed before the first deployment.
5. Applying migrations to each remote database.
6. Enabling Cloudflare Zero Trust and creating the Access policy for each admin Worker.
7. Each deployment, `preview` first.
8. Enabling AI later is a separate decision (section 7).

## 3. One-time setup

### 3.1 Login
The owner runs, in their own terminal (OAuth in the browser; the credential is stored in the user's home directory, never in the repository):

```bash
npx wrangler login
```

```bash
npx wrangler whoami
```

Do not create an API token for deployment, and never put one in `.dev.vars`, `.env`, or any file in the repository. The evaluation token from Phase 4 is not for deployment and should already be deleted (section 10).

### 3.2 D1 databases
One database per environment:

```bash
npx wrangler d1 create travel-discovery-preview
```

Record the printed `database_id` in the matching environment of **both** configs (C5). The ID is not a secret. Do not reuse the local placeholder `local-travel-discovery`; a deployment with it fails rather than touching another database (ADR-018). Create `travel-discovery-production` the same way only when production is approved. `--location` (location hint) is optional; leave it unset unless the owner chooses one.

### 3.3 Configuration (C5, ADR-026 "Stage 5 preparation decisions" C)
`env.preview` and `env.production` exist in both Wrangler configs (Phase 6, 2026-10-18), each with its own database and `namespace_id` values (`1001`/`1002` preview, `2001`/`2002` production); `env.production` also sets `name` to keep the top-level Worker names. `vars` and bindings are not inherited by named environments, so each environment declares everything it uses:
- Both Workers: `d1_databases` with that environment's `database_name` and `database_id` (the admin config also keeps `migrations_dir`); `"observability": { "enabled": true, "logs": { "enabled": true, "invocation_logs": false } }` (Workers Logs with the app's own lines only: invocation logs would store each request's IP address, headers, and geolocation, "Phase 7 verification log" in [DECISIONS.md](../working/DECISIONS.md)); `"workers_dev": true` and `"preview_urls": false`, set explicitly so the dashboard cannot silently diverge; `upload_source_maps`.
- Public Worker: `ai` binding; `vars` `AI_ASSIST_ENABLED: "false"` and `AI_MODEL: "@cf/google/gemma-4-26b-a4b-it"`; `ratelimits` binding `AI_CLIENT_RATE_LIMITER` (`simple: { limit: 5, period: 60 }`).
- Admin Worker: `ratelimits` binding `ADMIN_RATE_LIMITER` (suggested `limit: 120, period: 60`); `vars` `ACCESS_TEAM_DOMAIN` and `ACCESS_POLICY_AUD` (not secrets; known after 3.4, different for each admin Worker).
- Every `ratelimits` entry needs its own `namespace_id` (a positive integer as a string, unique in the account); bindings sharing an ID share counters, so preview and production must not share one.
- Never add `ai`, `ratelimits`, or AI variables to the top level: an `ai` binding always connects to Cloudflare, also from `npm run dev` and the tests.
- Never run `npm run dev` or `npm run dev:admin` with `CLOUDFLARE_ENV` set to a deployment environment, and do not use `npm run preview` after an environment build: both would use that environment's `ai` binding. Run `npm run build` without `CLOUDFLARE_ENV` to return `dist/` and `dist-admin/` to the local configuration.

Checks for C5 (local, no login; all passed for `env.preview` on 2026-10-18): the top-level build output (`dist/worker/wrangler.json`, `dist-admin/admin_worker/wrangler.json`) is unchanged apart from the list of defined environments; `CLOUDFLARE_ENV=preview npm run build` writes the expected flattened configuration; `npm run check` and `npm run test:e2e` pass; `npm run dev` shows no remote-binding warning.

### 3.4 Cloudflare Access for each admin Worker
Worker-level Access can only be applied to a Worker that exists, and an admin Worker must never be reachable without it. So:
1. Deploy the admin Worker the first time with `"workers_dev": false` (and `"preview_urls": false`) in that environment, so it has no URL. The Access tab is available for such a Worker (checked 2026-10-18).
2. Enable Zero Trust if needed (dashboard), choosing the team name; confirm the Free plan's seat limit and login methods (for example One-time PIN) there *(要確認: not stated in the documentation)*.
3. Workers & Pages → the admin Worker → Access → "Protect this Worker behind Access" → scope **All traffic**. The quick setup offers only "Cloudflare account" and "Email domain" policies (checked 2026-10-18): choose **Cloudflare account** (members of this account only), apply, then open Zero Trust → Access controls → Policies, edit the generated reusable policy (`<worker> - Production`), and change its Include rule to the **Emails** selector with the owner's full address. Never choose "Email domain" for a public mail provider (it admits every address there), the "Everyone" selector, or a "Login Methods: One-time PIN" Include rule, which admits anyone who can receive a PIN.
4. Copy the AUD tag (Zero Trust → Access controls → Applications → the Worker's application; the documentation names Configure → Additional settings → "Application Audience (AUD) Tag", but the dashboard may differ) and the team domain (`https://<team>.cloudflareaccess.com`; Zero Trust → Settings, or derived from the team name chosen when enabling Zero Trust) into `ACCESS_POLICY_AUD` and `ACCESS_TEAM_DOMAIN` of that environment, set `"workers_dev": true`, commit, rebuild, and redeploy. Without the two values every admin API request is answered with 403 (fail closed).
5. After any change on the Access tab or the policy, check both the scope (**All traffic**) and the Worker's `workers.dev` URL (Settings → Domains & Routes): on 2026-10-18 the scope was once found on "Previews only" and the URL was once found disabled after Access settings were saved. Right after the deployment that enables `workers_dev`, send an unauthenticated request to `/` and `/api/admin/me`: both must redirect to `https://<team>.cloudflareaccess.com/...`. If `/` returns 200, redeploy at once with `workers_dev: false`.
6. Do not create hostname or path Access applications with a Bypass policy that match admin hostnames (ADR-004 invariant 4), and do not use account-wide Worker protection (it would also protect the public site).

Repeat for the production admin Worker; it has its own Access setting and AUD.

### 3.5 Secrets
The Workers currently need no secrets: the AI binding needs none, and the Access values are not secret. If a secret is added later, set it with `npx wrangler secret put <NAME>` targeting the environment's Worker, or in the dashboard; never in files, `.dev.vars`, or `.env`. Deployments never delete secrets.

## 4. Database migrations
Migrations are applied only through the admin config, preview first:

```bash
npx wrangler d1 migrations apply travel-discovery-preview --remote --env preview --config wrangler.admin.jsonc
```

- Wrangler lists the pending migrations, asks for confirmation, and captures a backup before applying.
- Then the same with `travel-discovery-production` and `--env production`, after the preview checks pass.
- Before applying to production, record a restore point: `npx wrangler d1 time-travel info travel-discovery-production`. An additional SQL export is possible with `npx wrangler d1 export travel-discovery-production --remote --output <file>`; keep such exports outside the repository, because production exports contain the published content.
- Make schema changes backward compatible with the previously deployed code: a code rollback does not roll back the database (section 8).
- `db/seed/dev.sql` is local test data. Whether to load it into the preview database is an owner decision at that step *(要確認)*; never load it into production. Production content is entered through the admin console.

## 5. Build and deploy
1. Make sure no `.dev.vars` exists on the build machine, or that it holds only local test values: the build copies it into `dist/` and `dist-admin/` ([DEVELOPMENT.md](DEVELOPMENT.md)).
2. Check out the commit to deploy, with a clean `git status`, then run `npm ci` and `npm run check`.
3. Build both Workers for the environment. `CLOUDFLARE_ENV` is read by the Vite plugin at build time (it is ignored by `wrangler deploy`), and the build writes a configuration flattened to that environment; `npm run build` also runs the type check and the bundle checks:

   ```bash
   CLOUDFLARE_ENV=preview npm run build
   ```

4. Inspect what would be deployed without deploying (no login needed; checked 2026-10-18):

   ```bash
   npx wrangler deploy --dry-run --config dist/worker/wrangler.json
   ```

   ```bash
   npx wrangler deploy --dry-run --config dist-admin/admin_worker/wrangler.json
   ```

   Confirm the bindings and `vars` in the output; the dry run does not print the Worker name, which is the `name` field of the same `wrangler.json`. Each build also writes a redirect file (`.wrangler/deploy/config.json` for the public build, `admin/.wrangler/deploy/config.json` for the admin build, because the admin Vite root is `admin/`). Checked 2026-10-18 with Wrangler 4.151.1: a plain `npx wrangler deploy` from the repository root follows the redirect and deploys **only the public Worker**; with `--config <generated wrangler.json>` the redirect is not used; `--cwd admin` fails because the redirect file does not sit next to a user configuration. Always deploy with the explicit `--config` paths above.
5. Deploy each Worker with the same command without `--dry-run`, admin first during the initial setup (3.4), preview first in general.
6. Run section 6, then repeat with `production` after its approval.

## 6. Checks after each deployment
The unauthenticated checks below are automated in `node scripts/check-deployment.mjs <account subdomain> <preview|production>` (add `--watch-admin 120` after an admin deployment). Ongoing monitoring, routine checks, and incident response: [OPERATIONS.md](OPERATIONS.md).

From "Admin authentication status" and the verification logs in [DECISIONS.md](../working/DECISIONS.md), these can only be checked on a deployed Worker:
- Every admin URL (`workers.dev`, routes, custom domains) redirects to the Access login when not signed in; the admin static assets are not reachable without login.
- After login, the admin API accepts the request: the `Cf-Access-Jwt-Assertion` header reaches the Worker through the static-assets router and the token validates (RS256, issuer, audience).
- Version URLs are disabled for both Workers (`npx wrangler versions list --name <worker>` lists the deployed versions).
- The public and admin Workers see the same D1 data (publish in admin, then check the public API).
- The public site works end to end in `ja`, `en`, and `es`; the AI toggle shows the "unavailable" notice while AI is disabled.
- The Rate Limiting bindings deploy without errors (availability on the account is unconfirmed, ADR-026). If the deployment rejects them, remove them from that environment, record the result, and keep AI disabled (ADR-026 A, precondition 2).
- Workers Logs shows the AI endpoint's `disabled` outcome lines without addresses or answers.

## 7. Enabling AI (separate approval)
Preconditions (ADR-026 A): the account stays on Workers Free while AI is enabled; the per-client limiter is active; Workers Logs is enabled; the owner has reviewed the Gemma terms of use and prohibited-use policy.
1. In the environment's `vars`, set `AI_ASSIST_ENABLED: "true"`, commit, rebuild, and redeploy.
2. Check the AI notes in all three languages and the Workers AI usage in the dashboard.
3. Monitoring and stopping: ADR-026 E and [OPERATIONS.md](OPERATIONS.md) 4.4.

### 7.1 Preview trial (separate approval)
Verifies the per-client limiter (ADR-026 A, precondition 2) and the AI notes before any production decision. The trial itself, each deployment, and any later production use are separate owner decisions; this section is the plan, not an approval.

Preconditions (ADR-026 "Readiness for enabling AI"): the account is on Workers Free and Billing lists only the domain registration ([OPERATIONS.md](OPERATIONS.md) section 3); the owner reviewed the Gemma terms of use (done 2026-10-24); published content exists on preview; Workers Logs is on for the public preview Worker with invocation logs off.

**Budget.** The model is `@cf/google/gemma-4-26b-a4b-it`. Measured in the evaluation: a median of 7.3 Neurons per call (ADR-026 "Evaluation round 2"); estimated for real requests: about 7–14 Neurons, worst case about 105 (five destinations at the truncation limits, ADR-026 A). Workers Free allows 10,000 Neurons per day, reset at 00:00 UTC, after which calls fail without charge. Whether preview and production share this allowance is not stated on the pricing page (要確認); the plan assumes they do. The trial makes **at most 10 model calls**: about 70–140 Neurons expected, at most about 1,050 (about 10% of the daily allowance). Limiter requests with an invalid body make no model call.

**Window.** The public preview Worker has no Access protection, so anyone who knows its URL can use AI while it is enabled. Keep the window short: enable, test, and disable on the same day, early in the UTC day, without sharing the URL.

Steps:
1. Owner: in the dashboard, note the Workers AI Neurons already used today, so the trial's usage can be read as the difference.
2. Set `AI_ASSIST_ENABLED: "true"` in `env.preview` only (`wrangler.jsonc`), commit (owner-approved), run `CLOUDFLARE_ENV=preview npm run build`, check the dry run (preview database, `AI_ASSIST_ENABLED` `"true"`, `AI_CLIENT_RATE_LIMITER` 5 per 60 s), and deploy only the public preview Worker (section 5). Production and the admin Workers are not deployed.
3. Notes (about 5 model calls): in the built-in browser, answer one complete quiz in each of `ja`, `en`, and `es` from the start with the AI toggle on, then switch the language of one results page twice. Each step sends one request; returning to a language already shown sends none (ADR-026 C4). Wait at least 60 s between quizzes so the limiter does not refuse them.
4. Limiter (no model calls): wait 60 s, then from one address send same-origin requests with an empty object as the body. The order in the handler is method → origin → limiter → kill switch → body (the limiter comes before the kill switch since Phase 11), so the first requests answer 400 `invalid_request` and later ones 429 `rate_limited`:

   ```bash
   for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://travel-discovery-preview.<account subdomain>.workers.dev" -H "Content-Type: application/json" --data "{}" https://travel-discovery-preview.<account subdomain>.workers.dev/api/ai/explanations; done
   ```

   Record the count of 400 and 429 answers. Counters are per Cloudflare location and eventually consistent, so the first 429 may come after more than five requests; no 429 after 15 requests is a failure of this check (do not keep sending).
5. Logs (owner, Observability of `travel-discovery-preview`): every `ai_explanation` line has exactly `event`, `outcome`, `model`, `latencyMs`, and `destinationCount`, and no address, answer, constraint, prompt, or note text. Expected: one `ok` line per request of step 3 with `model` `@cf/google/gemma-4-26b-a4b-it`, `destinationCount` equal to the cards shown (5 by default), and `latencyMs` below 8,000; `rate_limited` lines with `latencyMs` 0 for step 4. Count any `invalid_output`, `timeout`, `provider_error`, or `content_mismatch` lines.
6. Owner review of the notes in `ja`, `en`, and `es`: written in the selected language, and in `ja` in the polite style of the UI; no ranking, scores, or comparison between destinations; no prices, costs, dates, seasons, opening hours, visa or entry rules, safety claims, or named facilities, events, or businesses that are not in the destination's authored text; nothing that contradicts the deterministic explanation. Also check that each note is labelled as AI-written, that the deterministic explanation, costs, and season notes are unchanged, and that the card order is the same as with AI off. Record the result per locale in [DECISIONS.md](../working/DECISIONS.md) without copying the notes into the repository.
7. Owner: read the Workers AI Neurons again and record the difference.
8. Disable: set `AI_ASSIST_ENABLED` back to `"false"`, commit, rebuild, redeploy the public preview Worker, and confirm 503 `ai_unavailable` with `scripts/check-deployment.mjs <account subdomain> preview` (while AI is enabled its AI check fails by design).

**Stop at once** (step 8, without finishing the other steps) when: the Neurons used by the trial exceed 1,000; ten model calls have been made; two responses end in anything other than `ok` or `rate_limited`; a note contains a price, date, ranking, or other forbidden content; or anything unexpected appears in the logs or the Billing page. The diagnosis keeps working throughout. A dashboard edit of the variable is faster than a redeployment but is overwritten by the next `wrangler deploy`, so commit `"false"` before deploying again.

**Record** in [DECISIONS.md](../working/DECISIONS.md): the date, version IDs, model calls made, Neurons before and after, the 400/429 counts of step 4, the outcome counts and latencies of step 5, and the owner's review of step 6.

**Blocks a later production decision** (any one): no 429 observed in step 4; `invalid_output`, `timeout`, or `provider_error` in more than one of the step 3 requests; any note with a ranking, comparison, or fact not in the data; Neurons per call well above the estimate (more than about 30 on average); a log line with more than the five fields or with any request content; the account not on Workers Free or a new charge in Billing; the Workers Logs volume close to the Free allowance ([OPERATIONS.md](OPERATIONS.md) section 7). Whether preview and production share the Neuron allowance stays 要確認 and is planned as shared. Enabling AI on production is a separate owner decision under section 7, taken only after this record exists.

### 7.2 Limiter check with AI disabled (separate approval)
Since Phase 11 the public Worker consults `AI_CLIENT_RATE_LIMITER` before the kill switch, so the limiter can be checked on a deployment with `AI_ASSIST_ENABLED` `"false"`: no model is called and nobody can use AI during the check. Requests refused by the limiter answer 429 `rate_limited`; the others answer 503 `ai_unavailable` and write a `disabled` line. Each request counts toward the Workers Free daily request limit (negligible here). The deployment and the check each need the owner's approval; production is not deployed for this check.

1. Deploy the commit with the new order to the public preview Worker only (section 5), with `AI_ASSIST_ENABLED` `"false"`; confirm in the dry run that `AI_CLIENT_RATE_LIMITER` (5 per 60 s) is present.
2. Wait at least 60 s after any other AI request from the same address (including `scripts/check-deployment.mjs`).
3. Run A, one connection: 15 requests in one `curl` call, which reuses the connection (`num_connects` is 1 for the first request and 0 for the others). `-4` keeps the requests on IPv4, so they share one key:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; args=(); for i in $(seq 1 15); do args+=("$URL/api/ai/explanations" -o /dev/null); done; curl -4 -s -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "${args[@]}"
   ```

4. Wait at least 60 s, then run B, a new connection per request:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; for i in $(seq 1 15); do curl -4 -s -o /dev/null -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "$URL/api/ai/explanations"; done
   ```

5. Wait at least 60 s, then run `node scripts/check-deployment.mjs <account subdomain> preview` (its AI check expects 503).
6. Owner, Observability of `travel-discovery-preview`: count the `rate_limited` and `disabled` lines of runs A and B; they should match the 429 and 503 counts.

Record in [DECISIONS.md](../working/DECISIONS.md) ("Phase 11 verification log") the version ID and, per run, the sequence of status codes and connection counts; never the address. Interpretation: 429 in both runs means the limiter works (the overshoot beyond five is the documented eventual consistency); 429 only in run A points to counters that are not yet shared when requests arrive on new connections; no 429 in either run points to the binding not reaching the Worker or not counting on this account. Do not send more than the two runs of 15 requests without a new decision.

## 8. Rollback
- Code: `npx wrangler rollback <VERSION_ID> --name <worker>` or the dashboard (Workers & Pages → the Worker → Deployments → Rollback). It takes effect immediately, works for the 100 most recent versions, and does not change bound resources: the database stays at its current schema and data. Static assets roll back with the version: checked on the public preview Worker on 2026-10-25 ("Phase 10 verification log" in [DECISIONS.md](../working/DECISIONS.md)), the served `index.html` and client bundle switched to those of the target version within about 20 s in both directions, and the other version's bundle was no longer served. Redeploying the build of the previous good commit is the alternative.
- Data: `npx wrangler d1 time-travel restore <database> --timestamp <unix|RFC3339>` (or `--bookmark`) restores a point within 7 days on Workers Free. It is **destructive**: it replaces all data, cancels in-flight queries, and prints a bookmark to undo it. Get the owner's approval for every restore.
- AI problems: use the kill switch (section 7) instead of a rollback.

## 9. Free-tier assumptions (re-check before deploying)
Checked 2026-10-18 ("Phase 6 verification log" in [DECISIONS.md](../working/DECISIONS.md)); free tiers and limits change.
- Workers Free: 100,000 requests/day per account (Error 1027 when exceeded, reset 00:00 UTC), 10 ms CPU per request. Static asset requests do not invoke the Worker ([DECISIONS.md](../working/DECISIONS.md) Phase 0 log). https://developers.cloudflare.com/workers/platform/limits/
- D1 Free: 5 million rows read and 100,000 rows written per day for the whole account (queries fail with a `D1_ERROR` until 00:00 UTC), 500 MB per database, 7-day Time Travel. https://developers.cloudflare.com/d1/platform/pricing/
- Workers AI: 10,000 Neurons/day free; on Workers Free, usage fails after that without charge. https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers Logs: 200,000 events/day, 3-day retention on Free. **From 2026-12-01 Workers Logs moves to Cloudflare Observability pricing**: on Free 0.5 GB ingestion per day and 7-day retention, ingestion stops at the limit without charge (checked 2026-10-19 and re-checked 2026-10-24 and 2026-10-25, unchanged; "Phase 7 verification log", "Phase 8 verification log", and "Phase 9 verification log" in [DECISIONS.md](../working/DECISIONS.md)). The account's daily volume, read on 2026-10-24, is a few percent of the allowance at most; the first check after the change is a dated task ([OPERATIONS.md](OPERATIONS.md) sections 3 and 7). https://developers.cloudflare.com/workers/observability/logs/workers-logs/, https://developers.cloudflare.com/observability/pricing/
- Rate Limiting binding: availability and price on Workers Free are not documented; confirmed only by an approved preview deployment. https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cloudflare Zero Trust Free: seat limit, price, and login methods are not stated on the plans page; confirm in the dashboard. https://www.cloudflare.com/plans/zero-trust-services/

## 10. Manual checks before the first deployment (owner)
- [ ] `npm run check` and `npm run test:e2e` pass on the commit to deploy; CI is green on GitHub after the push.
- [ ] `git status` is clean; no `.dev.vars`, `.env`, `.ai-eval/`, or `dist*/` content is committed.
- [ ] Keyboard-only run through the public quiz and the admin destination form in Chrome, with visible focus.
- [ ] Screen-reader spot check (VoiceOver) of the quiz, results, and language switcher.
- [ ] Light and dark mode, and 200% zoom, on a phone-sized and a desktop window.
- [ ] Reduced-motion setting: no blocking animation.
- [ ] Content review: costs show basis, source, and date; no wording suggests live prices; all published content has `ja` and `en` translations at least.
- [ ] Outbound search links open the provider start pages only, in a new tab.
- [x] The evaluation API token from Stage 5 has been deleted in the dashboard (owner, 2026-10-24).
- [x] The Gemma terms of use and prohibited-use policy have been reviewed (before enabling AI; owner, 2026-10-24).
- [ ] Commit author emails are acceptable for the intended visibility of the repository ([PUBLIC_RELEASE.md](../working/PUBLIC_RELEASE.md)).
