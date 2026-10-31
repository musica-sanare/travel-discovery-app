English | [日本語](../ja/OPERATIONS.md) · [Docs index](README.md)

# Operations Runbook

This runbook covers running the deployed app: where to look, routine and dated checks, incidents, backups, logs, publishing content, and actions that start charges. It is for the owner and anyone helping operate the app. How to deploy, migrate, and roll back is in [DEPLOYMENT.md](DEPLOYMENT.md); enabling AI is in [AI_ENABLEMENT.md](AI_ENABLEMENT.md); the facts behind each rule are in [DECISIONS.md](../working/DECISIONS.md).

> [!WARNING]
> A push to `main` deploys production; a push to `dev` runs CI only ([DEPLOYMENT.md](DEPLOYMENT.md) section 5). Every remote Wrangler command, rollback, restore, and account or Access change is an owner step: dashboard steps and owner sessions ([DEPLOYMENT.md](DEPLOYMENT.md) 3.1) that end with `npx wrangler logout`. Claude prepares them but never runs them.

Last reviewed: 2026-10-31.

## 1. What runs where

| Environment | Deployed by a push to | Public Worker | Admin Worker | D1 database |
|---|---|---|---|---|
| `production` | `main` | `travel-discovery` | `travel-discovery-admin` | `travel-discovery-production` |

- Both Workers are connected to this repository in Workers Builds ([DEPLOYMENT.md](DEPLOYMENT.md) 3.6) and use `workers.dev` (`<worker>.<account subdomain>.workers.dev`).
- The preview environment was removed on 2026-10-31. Until the owner deletes its Workers and database ([DEPLOYMENT.md](DEPLOYMENT.md) 3.7), they still exist but are no longer deployed or checked.
- The account is on Workers Free and Zero Trust Free. AI is disabled.
- Free-tier limits are shared by the whole account, including other projects on it ([DEPLOYMENT.md](DEPLOYMENT.md) section 9).

## 2. Where to look

| Signal | Where | Notes |
|---|---|---|
| Requests and errors per Worker | Dashboard: Workers & Pages → the Worker → Metrics | Still available with invocation logs disabled (checked on the former preview Worker, 2026-10-24). |
| App log lines | Dashboard: Workers & Pages → the Worker → Observability | Invocation logs are disabled, so only the app's own lines exist (section 6). |
| D1 usage | Dashboard: the D1 database → Metrics *(要確認: exact path)* | Cloudflare also emails when the account reaches a D1 daily limit. |
| Workers AI usage | Dashboard: Workers AI | Only relevant once AI is enabled. |
| AI quota Durable Object usage | Dashboard: Durable Objects *(要確認: exact path)* | Requests, rows written, and duration of `AiClientLimiter` against the Workers Free daily allowances (ADR-029). |
| Builds and deployments | Dashboard: Workers & Pages → the Worker → Deployments or Builds *(要確認: exact tab)* | Build logs, the deployed commit, and the version IDs. Kept for 90 days. |
| Build minutes | Dashboard *(要確認: where the monthly build minutes are shown)* | Workers Free includes 3,000 per month for the account ([DEPLOYMENT.md](DEPLOYMENT.md) section 9). |
| Account changes | Dashboard: Manage Account → Audit Log | Every deployment appears as an upload, a deployment, and "Update Worker Script Subdomain". |

App log lines are JSON, one per line. There are two kinds.

**`{"event":"api_error","context":…,"code":…,"errorName":…}`**: a request ended with 500 or 503 (`server/http/errors.ts`). `service_unavailable` means a D1 failure, including the daily limits.

**`{"event":"ai_explanation","outcome":…,"model":…,"latencyMs":…,"destinationCount":…}`**: one per AI request.
- Outcomes: `ok`, `content_mismatch`, `provider_error`, `timeout`, `invalid_output`, `disabled`, `rate_limited_window`, `rate_limited_daily`, `limiter_unavailable`. Before Phase 14 there was one `rate_limited` instead of the two `rate_limited_*` outcomes.
- An `invalid_output` line also has `reason`, the failed check: `json`, `shape`, `too_long`, `duplicate_id`, `id_set`, `too_short`, `digit`, `link`, `markup`, or `script` (ADR-026 "Phase 14 amendments").
- `limiter_unavailable` means the quota Durable Object failed or is missing (for example a Workers Free daily limit). No model is called and the client gets 503 (ADR-029).

Rate-limit lines can also appear while AI is disabled, because since Phase 11 the limiters run before the kill switch. Since Phase 14 the plan page disables the AI toggle while AI is off, so such requests come only from clients other than the UI.

## 3. Routine checks

**Weekly, and after any change on the Access tab, a Zero Trust policy, or the account subdomain:**
- Run the unauthenticated checks. The script exits 1 on any failure. It covers:
  - the public API in all locales and the security headers;
  - the AI endpoint and the AI status (`{"enabled":false}`) while AI is disabled;
  - the Access redirect (302 to `https://<team>.cloudflareaccess.com/...`) of `/`, `/destinations`, and `/api/admin/me` on the admin Worker.

  ```bash
  node scripts/check-deployment.mjs <account subdomain> production
  ```

  - A 200 from an admin URL is an incident (section 4.2).
  - Right after deploying an admin Worker, add `--watch-admin 120` to repeat the Access checks every 10 s for two minutes.
  - The script prepares TLS before its first request, which takes a few seconds on macOS. A timeout (15 s per request) still counts as a failure, so look at the failing URL with `curl` before treating it as an incident.
- Access tab of the admin Worker: scope **All traffic**. Zero Trust policy: an **Emails** Include rule with the owner's address only. No hostname or path Access application with a Bypass policy for an admin hostname (ADR-004).
- Observability of the public Worker: no unusual number of `api_error` lines.

**Monthly:**
- `npm audit --omit=dev` (expected: 0 vulnerabilities) and `npm audit` (known development-only advisory, ADR-003).
- New releases of the pinned GitHub Actions. Update the SHA and version comment together (ADR-027).
- The free-tier pages in [DEPLOYMENT.md](DEPLOYMENT.md) section 9 for changes.
- Billing (owner, in the dashboard): Manage Account → Billing lists only the domain registration and no other subscription, and the Workers plan is still Free. Anything else is an incident: do not pay or upgrade, and record what was found in [DECISIONS.md](../working/DECISIONS.md) (section 10 lists the actions that start charges).
- Workers Builds (owner, in the dashboard):
  - Build minutes used this month, against 3,000. Above 1,500, decide on build watch paths ([DEPLOYMENT.md](DEPLOYMENT.md) section 5 "Build minutes").
  - Each Worker still has its branch, build command, and deploy command from [DEPLOYMENT.md](DEPLOYMENT.md) section 5, and preview builds are disabled.
  - The Workers Builds API token (My Profile → API Tokens) still has only the permissions listed in [DEPLOYMENT.md](DEPLOYMENT.md) 3.6.
- This machine: `npx wrangler whoami` shows no logged-in account. A login left over from an owner session is logged out at once.

**Dated:**
- **First week of December 2026 (2026-12-01 to 2026-12-07)**: Workers Logs moved to Cloudflare Observability pricing on 2026-12-01 (section 7). Do this together with the December monthly checks:
  1. Re-read both pages linked in section 7.
  2. The owner reads the account's log ingestion in the dashboard (Billable Usage if it is shown, otherwise the Observability event counts) and the Billing page.
  3. Record the dates and values in section 7 and in [DECISIONS.md](../working/DECISIONS.md).
  4. Remove this entry and the matching item in section 9.

  Anything other than Free usage within the allowance is an incident: do not pay or upgrade.

## 4. Incidents

### 4.1 Public site shows "temporarily unavailable"
1. Check Metrics of the public Worker and its `api_error` lines.
2. Error 1027 or no Worker requests at all: the account's 100,000 requests/day are used up. Nothing to do until 00:00 UTC; static pages still load.
3. `api_error` with `service_unavailable`: a D1 failure. If Cloudflare sent a D1 daily-limit email, queries resume at 00:00 UTC; data is not affected.
4. Started right after a deployment: roll back in the dashboard, or revert the commit and push the branch ([DEPLOYMENT.md](DEPLOYMENT.md) section 8).
5. Never upgrade the plan to get out of a limit without the owner's decision (ADR-015).

### 4.2 Admin Worker reachable without Access
This is any unauthenticated 200 from an admin URL. The admin API still answers 403 without a valid token, but the admin UI must not be public.
1. Remove the URL at once (owner): disable `workers.dev` in the dashboard (Settings → Domains & Routes).
2. Before anything else is pushed to `main`, commit `"workers_dev": false` in `env.production` of `wrangler.admin.jsonc` on `dev`, push `dev`, then fast-forward `main` to it and push ([DEPLOYMENT.md](DEPLOYMENT.md) section 5, step 4). Otherwise the next build re-enables the URL. The push also redeploys the public Worker with the same commit.
3. Check the Access tab scope and the policy (section 3), and the Audit Log for what changed.
4. Commit `"workers_dev": true` again, push it to `dev` and `main` the same way, and check the redirect immediately and for two minutes (`--watch-admin 120`).
5. Record the incident in [DECISIONS.md](../working/DECISIONS.md).

### 4.3 Wrong content published
Archive or correct it in the admin console. To undo a larger mistake, restore the database with Time Travel (section 5).

### 4.4 AI problems or abuse (once AI is enabled)
Stop AI with the kill switch ([AI_ENABLEMENT.md](AI_ENABLEMENT.md), ADR-026 E); the diagnosis keeps working. Stop when:
- Neurons exceed about 70% of the daily allocation before 12:00 UTC, or
- rate-limit (`rate_limited_window`, `rate_limited_daily`) or `provider_error` outcomes spike.

### 4.5 A build fails, or no build starts
The previous version keeps serving; nothing is broken for users.
1. Read the build log ([DEPLOYMENT.md](DEPLOYMENT.md) section 5, step 5).
2. A failure in `npm run build` or the deploy step: fix it on `dev`, then push `dev` and `main` again. Do not change the build settings to get past a failing check.
3. Only one of the two Workers deployed: the two Workers run different commits. Retry the failed build in the dashboard, or roll the other one back ([DEPLOYMENT.md](DEPLOYMENT.md) section 8).
4. No build starts, or the build minutes are used up: stop pushing. Never upgrade the plan to get builds back. Wait for the monthly reset, or deploy locally only by owner decision ([DEPLOYMENT.md](DEPLOYMENT.md) section 5 "Local deployment"). Record it in [DECISIONS.md](../working/DECISIONS.md).

## 5. Backups and restore
- D1 Time Travel keeps 7 days on Workers Free. Before bulk content changes, record a bookmark in an owner session ([DEPLOYMENT.md](DEPLOYMENT.md) 3.1): `npx wrangler d1 time-travel info travel-discovery-production`.
- A restore replaces the whole database and is destructive ([DEPLOYMENT.md](DEPLOYMENT.md) section 8). It always needs the owner's approval.
- Optional SQL exports (`npx wrangler d1 export … --remote --output <file>`) stay outside the repository.

## 6. Logs and privacy
- Workers Logs is enabled on both Workers with invocation logs disabled. Do not re-enable them: invocation logs would store each request with its IP address, headers (including Access tokens on the admin Workers), and geolocation ("Phase 7 verification log" in [DECISIONS.md](../working/DECISIONS.md)).
- The app's own lines contain no addresses, answers, or texts. Keep it that way when adding log lines.
- Retention: 3 days on Workers Free, 7 days from 2026-12-01.
- When sharing a log entry, remove the account ID and hostnames first.

## 7. Workers Logs pricing from 2026-12-01
From 2026-12-01, the Free plan allows 0.5 GB of ingestion per day with 7-day retention. At the limit, ingestion stops until 00:00 UTC and nothing is charged. Until 2026-12-01 the Free limit is 200,000 events per day with 3-day retention. The allowance is shared by every Worker on the account.

Checked 2026-10-19 and re-checked 2026-10-24 and 2026-10-25, unchanged:
- https://developers.cloudflare.com/observability/pricing/ (updated 2026-10-15)
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/ (updated 2026-10-12)

Volume (owner, dashboard, 2026-10-24; "Phase 9 verification log" in [DECISIONS.md](../working/DECISIONS.md)):
- With invocation logs disabled, only `api_error` and `ai_explanation` lines are ingested.
- The account-wide total is normally about one line per hour, with peaks of about 30–40 lines per minute during manual checks.
- That is a few percent of the allowance at most, even at an assumed 5 KB per line (line size not documented).
- If the volume approaches the limit, lower `head_sampling_rate` in the environment's `observability` block.
- After 2026-12-01, confirm the actual ingestion once (section 3 "Dated").

## 8. Publishing production content
Content is entered only through the production admin console, either in the forms or on the **Import** page with a reviewed bundle from `content/` (ADR-028). `db/seed/dev.sql` is never loaded into production. The rules below come from [SPEC.md](SPEC.md), [DIAGNOSTIC_ALGORITHM.md](DIAGNOSTIC_ALGORITHM.md), and the admin validation (`server/admin/validation.ts`).

Before:
- Record a Time Travel bookmark (section 5).

Importing a bundle (ADR-028):
1. Open Import in the production admin console and load the file (for example `content/initial-v1.json`).
2. Select "Check". The summary lists what will be created and what is skipped because the slug exists. Fix any reported problem in the file first.
3. Select "Import" and wait for "The import is complete". If it stops, the message names the item and the reason. Fix the file, check again, and import again (created items are skipped).

Updating existing items (ADR-028 "Update mode"):
1. Record a Time Travel bookmark, open Import, load the file, and select **Update existing items** before "Check".
2. Read the "Changes" of every item to update.
   - Each country, attribute, category, destination, and question is replaced entirely by the file, so a value changed in the forms since the file was written is overwritten. Fix the file first if that change must stay.
   - Treat a highlighted change of the publication status as a mistake unless it is intended.
   - A question in the file must list every active option it has in the database. Otherwise the check reports the missing option and nothing is imported. Deactivate options in the question form instead.
3. Select "Import". If it stops with "changed after the check", check again and review the new changes. If the admin request limit is reached, the page waits about a minute and continues on its own.

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
- Translations: the admin console requires `ja` or `en` to publish. Publish with `ja`, `en`, `es`, and `fr` where possible, and at least `ja` and `en` ([DEPLOYMENT.md](DEPLOYMENT.md) section 10). Missing locales fall back as described in ADR-012.
- Costs: indicative ranges only, with currency, period, basis in every translated locale, source, and the date checked. Never use wording that suggests live prices (ADR-008).
- Images: `https` URL, attribution, and alt text in every translated locale. Check the provider's license ([PUBLIC_RELEASE.md](../working/PUBLIC_RELEASE.md) section 4).
- Best months, recommended days, and cautions where known. Leave unknown values empty rather than guessing.
- A human-authored summary and highlights, which also serve as the explanation when AI is off.

After:
- Run the checks of section 3 for production.
- Go through the public site in `ja`, `en`, `es`, and `fr` on a phone-sized and a desktop window: quiz to results, back/edit/restart, cost basis and date, the AI-unavailable notice, and the outbound search links.
- Record a new Time Travel bookmark.

## 9. Open items
- **Preview resources:** the two preview Workers, the Access application of the admin preview Worker, and the preview database still exist until the owner deletes them ([DEPLOYMENT.md](DEPLOYMENT.md) 3.7).
- **Rejection of an address outside the Access policy:** not checked. It needs a second Cloudflare account, which the owner postponed (2026-10-24).
- **The 429 response of `AI_CLIENT_RATE_LIMITER`.** Current state (2026-10-31, Phase 14): the strict per-client quota in a Durable Object (ADR-029) is deployed to production (version `cc06950d`), where the limiter check passed ("Phase 14 verification log"). Enabling AI on production is a separate owner decision (ADR-026 "Readiness for enabling AI"). History:
  - 2026-10-25, preview AI trial: no 429 was observed (15 requests from one address, all 400; "Phase 10 verification log" in [DECISIONS.md](../working/DECISIONS.md)); cause 要確認. This blocks enabling AI on production (ADR-026 "Readiness for enabling AI").
  - 2026-10-25, Phase 11: different keys for IPv4 and IPv6 and the binding being unavailable on Workers Free were ruled out. The limiter now runs before the kill switch.
  - The check with AI disabled on preview ([AI_ENABLEMENT.md](AI_ENABLEMENT.md) section 3, 2026-10-25) returned 429 after six requests on one connection, but none for 15 requests that each opened a new connection. So a client can bypass the binding.
  - The owner chose a strict per-client quota in a Durable Object (ADR-029, 2026-10-25). Its preview check ([AI_ENABLEMENT.md](AI_ENABLEMENT.md) section 3, 2026-10-25) let exactly five requests pass on one connection and on new connections alike, then answered 429 ("Phase 11 verification log").
- **Log ingestion after the Cloudflare Observability pricing change of 2026-12-01:** check once in the first week of December 2026 (section 3 "Dated"). The volume before the change was recorded on 2026-10-24 (section 7).

## 10. Actions that start charges
The account stays on Workers Free; the only accepted charge is the existing domain registration. None of the dashboard actions below is taken without the owner's decision, recorded in [DECISIONS.md](../working/DECISIONS.md) together with the expected monthly cost. Checked 2026-10-24 on the linked pages.
- **Upgrading to Workers Paid:** at least USD 5 per month per account. Usage above the included allotments (D1, Workers Logs, Queues, and others) is then billed instead of failing (https://developers.cloudflare.com/workers/platform/pricing/, updated 2026-10-02). After 2026-12-01 paid log ingestion also continues automatically above the included amount (https://developers.cloudflare.com/observability/pricing/).
- **Workers Builds on Workers Paid:** 6,000 build minutes per month, then USD 0.005 per minute. On Free, what happens at 3,000 minutes is not stated *(要確認)*; never upgrade to get more builds (https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/, updated 2026-10-28).
- **Workers Logpush:** available only on Workers Paid (https://developers.cloudflare.com/workers/observability/logs/logpush/, updated 2026-10-12).
- **Enabling R2:** free tier of 10 GB-month of Standard storage, 1 million Class A and 10 million Class B operations per month, per-unit prices above it (https://developers.cloudflare.com/r2/pricing/, updated 2026-10-01). Whether enabling R2 requires a payment method is not stated on the page *(要確認)*.
- **Purchasing Images Paid:** enables image storage (USD 5 per 100,000 stored per month) and delivery (USD 1 per 100,000), and bills transformations above 5,000 per month. On the Free plan, transformations above the limit fail with error 9422 and are not charged (https://developers.cloudflare.com/images/pricing/, updated 2026-10-19).
- **Log Explorer datasets:** billed separately at USD 1 per GB ingested. The page does not say whether Free accounts can use them (https://developers.cloudflare.com/observability/pricing/).
- Any other plan upgrade, add-on subscription, or Zero Trust plan other than Free.
