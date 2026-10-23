# Operations Runbook

Last reviewed: 2026-10-24. This page covers running the deployed app; how to deploy, migrate, enable AI, and roll back is in `docs/DEPLOYMENT.md`, and the facts behind each rule are in `docs/DECISIONS.md`. Every remote Wrangler command, deployment, rollback, restore, and account or Access change needs the owner's approval at that time. Dashboard steps are the owner's.

## 1. What runs where

| Environment | Public Worker | Admin Worker | D1 database |
|---|---|---|---|
| `preview` | `travel-discovery-preview` | `travel-discovery-admin-preview` | `travel-discovery-preview` (seed data) |
| `production` | `travel-discovery` | `travel-discovery-admin` | `travel-discovery-production` |

All four Workers use `workers.dev` (`<worker>.<account subdomain>.workers.dev`). The account is on Workers Free and Zero Trust Free; AI is disabled everywhere. Free-tier limits are shared by the whole account, so heavy use of preview also affects production (`docs/DEPLOYMENT.md` section 9).

## 2. Where to look

| Signal | Where | Notes |
|---|---|---|
| Requests and errors per Worker | Dashboard: Workers & Pages → the Worker → Metrics | Still available with invocation logs disabled (checked on preview, 2026-10-24). |
| App log lines | Dashboard: Workers & Pages → the Worker → Observability | Invocation logs are disabled, so only the app's own lines exist (section 6). |
| D1 usage | Dashboard: the D1 database → Metrics *(要確認: exact path)* | Cloudflare also emails when the account reaches a D1 daily limit. |
| Workers AI usage | Dashboard: Workers AI | Only relevant once AI is enabled. |
| Account changes | Dashboard: Manage Account → Audit Log | Every Wrangler deployment appears as an upload, a deployment, and "Update Worker Script Subdomain". |

App log lines (JSON, one per line):
- `{"event":"api_error","context":…,"code":…,"errorName":…}`: a request ended with 500 or 503 (`server/http/errors.ts`). `service_unavailable` means a D1 failure, including the daily limits.
- `{"event":"ai_explanation","outcome":…,"model":…,"latencyMs":…,"destinationCount":…}`: one per AI request. Outcomes: `ok`, `content_mismatch`, `provider_error`, `timeout`, `invalid_output`, `disabled`, `rate_limited`.

## 3. Routine checks

Weekly, and after any change on the Access tab, a Zero Trust policy, or the account subdomain:
- Unauthenticated requests to both admin Workers must redirect (302) to `https://<team>.cloudflareaccess.com/...`:

  ```bash
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://travel-discovery-admin.<account subdomain>.workers.dev/api/admin/me
  ```

  Repeat for `/` and for `travel-discovery-admin-preview`. A 200 is an incident (section 4.2).
- Access tab of each admin Worker: scope **All traffic**; Zero Trust policy: an **Emails** Include rule with the owner's address only; no hostname or path Access application with a Bypass policy for an admin hostname (ADR-004).
- Observability of both public Workers: no unusual number of `api_error` lines.

Monthly:
- `npm audit --omit=dev` (expected: 0 vulnerabilities) and `npm audit` (known development-only advisory, ADR-003).
- New releases of the pinned GitHub Actions; update the SHA and version comment together (ADR-027).
- The free-tier pages in `docs/DEPLOYMENT.md` section 9 for changes.

Dated:
- **Before 2026-12-01**: Workers Logs moves to Cloudflare Observability pricing (section 7).

## 4. Incidents

### 4.1 Public site shows "temporarily unavailable"
1. Check Metrics of the public Worker and its `api_error` lines.
2. Error 1027 or no Worker requests at all: the account's 100,000 requests/day are used up. Nothing to do until 00:00 UTC; static pages still load.
3. `api_error` with `service_unavailable`: a D1 failure. If Cloudflare sent a D1 daily-limit email, queries resume at 00:00 UTC; data is not affected.
4. Started right after a deployment: roll back (`docs/DEPLOYMENT.md` section 8) or redeploy the previous good commit.
5. Never upgrade the plan to get out of a limit without the owner's decision (ADR-015).

### 4.2 Admin Worker reachable without Access
Any unauthenticated 200 from an admin URL. The admin API still answers 403 without a valid token, but the admin UI must not be public.
1. Remove the URL at once: redeploy that Worker with `"workers_dev": false` in its environment (rebuild with `CLOUDFLARE_ENV=<env>`, deploy with `--config dist-admin/admin_worker/wrangler.json`), or disable `workers.dev` in the dashboard (Settings → Domains & Routes), which is faster but is reverted by the next deployment.
2. Check the Access tab scope and the policy (section 3), and the Audit Log for what changed.
3. Re-enable `workers_dev`, redeploy, and check the redirect immediately and for two minutes.
4. Record the incident in `docs/DECISIONS.md`.

### 4.3 Wrong content published
Archive or correct it in the admin console. To undo a larger mistake, restore the database with Time Travel (section 5).

### 4.4 AI problems or abuse (once AI is enabled)
Stop AI with the kill switch (`docs/DEPLOYMENT.md` section 7, ADR-026 E); the diagnosis keeps working. Stop when Neurons exceed about 70% of the daily allocation before 12:00 UTC, or when `rate_limited` or `provider_error` outcomes spike.

## 5. Backups and restore
- D1 Time Travel keeps 7 days on Workers Free. Before bulk content changes, record a bookmark: `npx wrangler d1 time-travel info travel-discovery-production` (remote read; approval).
- A restore replaces the whole database and is destructive (`docs/DEPLOYMENT.md` section 8); it always needs the owner's approval.
- Optional SQL exports (`npx wrangler d1 export … --remote --output <file>`) stay outside the repository.

## 6. Logs and privacy
- Workers Logs is enabled on all four Workers with invocation logs disabled. Invocation logs would store each request with its IP address, headers (including Access tokens on the admin Workers), and geolocation ("Phase 7 verification log" in `docs/DECISIONS.md`). Do not re-enable them.
- The app's own lines contain no addresses, answers, or texts. Keep it that way when adding log lines.
- Retention: 3 days on Workers Free, 7 days from 2026-12-01.
- When sharing a log entry, remove the account ID and hostnames first.

## 7. Workers Logs pricing from 2026-12-01
Checked 2026-10-19 (https://developers.cloudflare.com/observability/pricing/): on Free, 0.5 GB of ingestion per day and 7-day retention; at the limit ingestion stops until 00:00 UTC and nothing is charged. With invocation logs disabled, only `api_error` and `ai_explanation` lines are ingested, which is expected to stay far below the limit *(要確認: daily volume in the dashboard)*. If the volume approaches the limit, lower `head_sampling_rate` in the environment's `observability` block. Re-check the page before 2026-12-01 and update this section.

## 8. Open items
- Rejection of an address outside the Access policy: not checked; it needs a second Cloudflare account, which the owner postponed (2026-10-24).
- The 429 response of `AI_CLIENT_RATE_LIMITER`: observable only with AI enabled (ADR-026 "Open decisions").
