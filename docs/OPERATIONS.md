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
- Run the unauthenticated checks for both environments. They cover the public API in all locales, the security headers, the AI endpoint while AI is disabled, and the Access redirect (302 to `https://<team>.cloudflareaccess.com/...`) of `/`, `/destinations`, and `/api/admin/me` on the admin Worker; the script exits 1 on any failure:

  ```bash
  node scripts/check-deployment.mjs <account subdomain> production
  ```

  ```bash
  node scripts/check-deployment.mjs <account subdomain> preview
  ```

  A 200 from an admin URL is an incident (section 4.2). Right after deploying an admin Worker, add `--watch-admin 120` to repeat the Access checks every 10 s for two minutes.
- Access tab of each admin Worker: scope **All traffic**; Zero Trust policy: an **Emails** Include rule with the owner's address only; no hostname or path Access application with a Bypass policy for an admin hostname (ADR-004).
- Observability of both public Workers: no unusual number of `api_error` lines.

Monthly:
- `npm audit --omit=dev` (expected: 0 vulnerabilities) and `npm audit` (known development-only advisory, ADR-003).
- New releases of the pinned GitHub Actions; update the SHA and version comment together (ADR-027).
- The free-tier pages in `docs/DEPLOYMENT.md` section 9 for changes.
- Billing (owner, in the dashboard): Manage Account → Billing lists only the domain registration and no other subscription, and the Workers plan is still Free. Anything else is an incident: do not pay or upgrade, and record what was found in `docs/DECISIONS.md` (section 10 lists the actions that start charges).

Dated:
- **Before 2026-12-01**: Workers Logs moves to Cloudflare Observability pricing. Re-check the pages in the last week of November 2026 and compare the daily log volume with the Free allowance (section 7).

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
Checked 2026-10-19 and re-checked 2026-10-24, unchanged (https://developers.cloudflare.com/observability/pricing/, updated 2026-10-15; https://developers.cloudflare.com/workers/observability/logs/workers-logs/, updated 2026-10-12): on Free, 0.5 GB of ingestion per day and 7-day retention; at the limit ingestion stops until 00:00 UTC and nothing is charged. Until 2026-12-01 the Free limit is 200,000 events per day with 3-day retention. With invocation logs disabled, only `api_error` and `ai_explanation` lines are ingested, which is expected to stay far below the limit *(要確認: daily volume in the dashboard)*. If the volume approaches the limit, lower `head_sampling_rate` in the environment's `observability` block. Re-check both pages once more in the last week of November 2026 and update this section with the date.

## 8. Publishing production content
Content is entered only through the production admin console, either in the forms or on the **Import** page with a reviewed bundle from `content/` (ADR-028); `db/seed/dev.sql` is never loaded into production. The rules below come from `docs/SPEC.md`, `docs/DIAGNOSTIC_ALGORITHM.md`, and the admin validation (`server/admin/validation.ts`).

Before:
- Record a Time Travel bookmark (section 5).

Importing a bundle (ADR-028):
1. Open Import in the production admin console and load the file (for example `content/initial-v1.json`).
2. Select "Check": the summary lists what will be created and what is skipped because the slug exists. Fix any reported problem in the file first.
3. Select "Import" and wait for "The import is complete". If it stops, the message names the item and the reason; fix the file, check again, and import again (created items are skipped).

Updating existing destinations (ADR-028 "Update mode"):
1. Record a Time Travel bookmark, open Import, load the file, and select **Update existing destinations** before "Check".
2. Read the "Changes" of every destination to update. Each destination is replaced entirely by the file, so a value changed in the forms since the file was written is overwritten; fix the file first if that change must stay. Treat a highlighted change of the publication status as a mistake unless it is intended.
3. Select "Import". If it stops with "changed after the check", check again and review the new changes. Countries, attributes, categories, and questions are never updated this way; change them in the forms.

Order (later items reference earlier ones):
1. Countries.
2. Attributes (`active`), the dimensions destinations are scored on (0–5).
3. Question categories (`active`).
4. Destinations, with a score for each attribute.
5. Questions, whose options have non-zero effects (−5 to 5) on active attributes.
6. Quiz settings (defaults: 6 minimum, 10 target, 12 maximum questions; 5 results).

Minimum for a useful diagnosis:
- At least as many published destinations as the result count (5 by default). With fewer, results show fewer destinations with a notice.
- At least the target number of published questions (10 by default), each with two or more active options and at least one effect on an active attribute (otherwise it is skipped). With fewer, the quiz ends early and shows a notice. More questions than the target give variation between sessions.
- Questions spread over several categories (selection balances categories).

Each published item:
- Translations: the admin console requires `ja` or `en` to publish. Publish with `ja`, `en`, and `es` where possible, and at least `ja` and `en` (`docs/DEPLOYMENT.md` section 10); missing locales fall back as described in ADR-012.
- Costs: indicative ranges only, with currency, period, basis in every translated locale, source, and the date checked; never wording that suggests live prices (ADR-008).
- Images: `https` URL, attribution, and alt text in every translated locale; check the provider's license (`docs/PUBLIC_RELEASE.md` section 4).
- Best months, recommended days, and cautions where known; leave unknown values empty rather than guessing.
- A human-authored summary and highlights, which also serve as the explanation when AI is off.

After:
- Run the checks of section 3 for production, then go through the public site in `ja`, `en`, and `es` on a phone-sized and a desktop window: quiz to results, back/edit/restart, cost basis and date, the AI-unavailable notice, and the outbound search links.
- Record a new Time Travel bookmark.

## 9. Open items
- Rejection of an address outside the Access policy: not checked; it needs a second Cloudflare account, which the owner postponed (2026-10-24).
- The 429 response of `AI_CLIENT_RATE_LIMITER`: observable only with AI enabled (ADR-026 "Open decisions").
- Daily Workers Logs volume compared with the 0.5 GB Free allowance (section 7): to be read by the owner in the dashboard before 2026-12-01.

## 10. Actions that start charges
The account stays on Workers Free; the only accepted charge is the existing domain registration. None of the dashboard actions below is taken without the owner's decision, recorded in `docs/DECISIONS.md` together with the expected monthly cost. Checked 2026-10-24 on the linked pages.
- **Upgrading to Workers Paid**: at least USD 5 per month per account; usage above the included allotments (D1, Workers Logs, Queues, and others) is then billed instead of failing (https://developers.cloudflare.com/workers/platform/pricing/, updated 2026-10-02). After 2026-12-01 paid log ingestion also continues automatically above the included amount (https://developers.cloudflare.com/observability/pricing/).
- **Workers Logpush**: available only on Workers Paid (https://developers.cloudflare.com/workers/observability/logs/logpush/, updated 2026-10-12).
- **Enabling R2**: free tier of 10 GB-month of Standard storage, 1 million Class A and 10 million Class B operations per month, per-unit prices above it (https://developers.cloudflare.com/r2/pricing/, updated 2026-10-01). Whether enabling R2 requires a payment method is not stated on the page *(要確認)*.
- **Purchasing Images Paid**: enables image storage (USD 5 per 100,000 stored per month) and delivery (USD 1 per 100,000) and bills transformations above 5,000 per month. On the Free plan, transformations above the limit fail with error 9422 and are not charged (https://developers.cloudflare.com/images/pricing/, updated 2026-10-19).
- **Log Explorer datasets**: billed separately at USD 1 per GB ingested; the page does not say whether Free accounts can use them (https://developers.cloudflare.com/observability/pricing/).
- Any other plan upgrade, add-on subscription, or Zero Trust plan other than Free.
