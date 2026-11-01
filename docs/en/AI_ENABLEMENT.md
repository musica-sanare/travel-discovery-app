English | [日本語](../ja/AI_ENABLEMENT.md) · [Docs index](README.md)

# AI Enablement Runbook

This runbook describes how to enable the optional AI notes on a deployed Worker, test them, and turn them off again. It is for the owner and anyone preparing these steps for the owner's approval. It covers the general steps, the record of the preview trial, the limiter check with AI disabled, and enabling AI on production. Building and deploying are in [DEPLOYMENT.md](DEPLOYMENT.md); monitoring is in [OPERATIONS.md](OPERATIONS.md).

> [!WARNING]
> Enabling AI, each trial, each deployment, and any later production use are separate owner decisions. The sections below are plans, not approvals.

AI is disabled on production, the only deployment environment since 2026-10-31. The diagnosis keeps working whether AI is on or off.

## 1. Enabling AI (general steps)
These sections were section 7 of [DEPLOYMENT.md](DEPLOYMENT.md) until the docs were reorganized.

Preconditions (ADR-026 A):
- The account stays on Workers Free while AI is enabled.
- The per-client limiter is active.
- Workers Logs is enabled.
- The owner has reviewed the Gemma terms of use and prohibited-use policy.

Steps:
1. In `env.production` `vars`, set `AI_ASSIST_ENABLED: "true"` and commit. The owner's push to `main` deploys it ([DEPLOYMENT.md](DEPLOYMENT.md) section 5).
2. Check the AI notes in all four languages and the Workers AI usage in the dashboard.
3. Monitoring and stopping: ADR-026 E and [OPERATIONS.md](OPERATIONS.md) 4.4.
4. For production, follow section 4 (prepared in Phase 14, not yet approved).

## 2. Preview trial (separate approval)
> [!NOTE]
> Done on 2026-10-25 ("Phase 10 verification log" in [DECISIONS.md](../working/DECISIONS.md)). The preview environment was removed on 2026-10-31 (ADR-033), so this section is the record of that trial and cannot be repeated as written. Any later trial runs on production under section 4.

The trial verifies the per-client limiter (ADR-026 A, precondition 2) and the AI notes before any production decision. The trial itself, each deployment, and any later production use are separate owner decisions; this section is the plan, not an approval.

**Preconditions** (ADR-026 "Readiness for enabling AI"):
- The account is on Workers Free and Billing lists only the domain registration ([OPERATIONS.md](OPERATIONS.md) section 3).
- The owner reviewed the Gemma terms of use (done 2026-10-24).
- Published content exists on preview.
- Workers Logs is on for the public preview Worker with invocation logs off.

**Budget.** The trial makes **at most 10 model calls**: about 70–140 Neurons expected, at most about 1,050 (about 10% of the daily allowance).
- The model is `@cf/google/gemma-4-26b-a4b-it`.
- Measured in the evaluation: a median of 7.3 Neurons per call (ADR-026 "Evaluation round 2").
- Estimated for real requests: about 7–14 Neurons, worst case about 105 (five destinations at the truncation limits, ADR-026 A).
- Workers Free allows 10,000 Neurons per day, reset at 00:00 UTC, after which calls fail without charge.
- Whether preview and production share this allowance is not stated on the pricing page (要確認); the plan assumes they do.
- Limiter requests with an invalid body make no model call.

**Window.** Keep the window short: enable, test, and disable on the same day, early in the UTC day, without sharing the URL. The public preview Worker has no Access protection, so anyone who knows its URL can use AI while it is enabled.

Steps:
1. Owner: in the dashboard, note the Workers AI Neurons already used today, so the trial's usage can be read as the difference.
2. Enable AI on the public preview Worker only:
   - Set `AI_ASSIST_ENABLED: "true"` in `env.preview` only (`wrangler.jsonc`) and commit (owner-approved).
   - Run `CLOUDFLARE_ENV=preview npm run build`.
   - Check the dry run: preview database, `AI_ASSIST_ENABLED` `"true"`, `AI_CLIENT_RATE_LIMITER` 5 per 60 s.
   - Deploy only the public preview Worker, from the owner's local login as before Workers Builds. Production and the admin Workers are not deployed.
3. Notes (about 6 model calls): in the built-in browser, answer one complete quiz in each of `ja`, `en`, `es`, and `fr` from the start with the AI toggle on. Then switch the language of one results page twice.
   - Each step sends one request; returning to a language already shown sends none (ADR-026 C4).
   - Wait at least 60 s between quizzes so the limiter does not refuse them.
4. Limiter (no model calls): wait 60 s, then from one address send same-origin requests with an empty object as the body.
   - The order in the handler is method → origin → limiters → kill switch → body. The limiters come before the kill switch since Phase 11.
   - So the first requests answer 400 `invalid_request` and later ones 429 `rate_limited` (since Phase 14 with `limit` and `retryAfter`, ADR-026 "Phase 14 amendments").

   ```bash
   for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://travel-discovery-preview.<account subdomain>.workers.dev" -H "Content-Type: application/json" --data "{}" https://travel-discovery-preview.<account subdomain>.workers.dev/api/ai/explanations; done
   ```

   Record the count of 400 and 429 answers. Counters are per Cloudflare location and eventually consistent, so the first 429 may come after more than five requests. No 429 after 15 requests is a failure of this check (do not keep sending).
5. Logs (owner, Observability of `travel-discovery-preview`):
   - Every `ai_explanation` line has exactly `event`, `outcome`, `model`, `latencyMs`, and `destinationCount`. An `invalid_output` line also has `reason`, a fixed code of the failed check (since Phase 14).
   - No line has an address, answer, constraint, prompt, or note text.
   - Expected for step 3: one `ok` line per request, with `model` `@cf/google/gemma-4-26b-a4b-it`, `destinationCount` equal to the cards shown (5 by default), and `latencyMs` below 8,000.
   - Expected for step 4: `rate_limited_window` lines (before Phase 14 `rate_limited`) with `latencyMs` 0.
   - Count any `invalid_output`, `timeout`, `provider_error`, or `content_mismatch` lines.
6. Owner review of the notes in `ja`, `en`, `es`, and `fr`:
   - Written in the selected language, in `ja` in the polite style of the UI, and in `fr` with `vous`.
   - No ranking, scores, or comparison between destinations.
   - No prices, costs, dates, seasons, opening hours, visa or entry rules, safety claims, or named facilities, events, or businesses that are not in the destination's authored text.
   - Nothing that contradicts the deterministic explanation.
   - Each note is labelled as AI-written; the deterministic explanation, costs, and season notes are unchanged; the card order is the same as with AI off.
   - Record the result per locale in [DECISIONS.md](../working/DECISIONS.md) without copying the notes into the repository.
7. Owner: read the Workers AI Neurons again and record the difference.
8. Disable: set `AI_ASSIST_ENABLED` back to `"false"`, commit, rebuild, and redeploy the public preview Worker. Confirm 503 `ai_unavailable` and `{"enabled":false}` from `/api/ai/status` with `scripts/check-deployment.mjs <account subdomain> preview`. While AI is enabled, its AI checks fail by design.

**Stop at once** (step 8, without finishing the other steps) when:
- the Neurons used by the trial exceed 1,000;
- ten model calls have been made;
- two responses end in anything other than `ok`, `rate_limited_window`, or `rate_limited_daily`;
- a note contains a price, date, ranking, or other forbidden content;
- anything unexpected appears in the logs or the Billing page.

The diagnosis keeps working throughout. A dashboard edit of the variable is faster than a redeployment but is overwritten by the next deployment, so commit `"false"` before deploying again.

**Record** in [DECISIONS.md](../working/DECISIONS.md): the date, version IDs, model calls made, Neurons before and after, the 400/429 counts of step 4, the outcome counts and latencies of step 5, and the owner's review of step 6.

**Blocks a later production decision** (any one):
- no 429 observed in step 4;
- `invalid_output`, `timeout`, or `provider_error` in more than one of the step 3 requests;
- any note with a ranking, comparison, or fact not in the data;
- Neurons per call well above the estimate (more than about 30 on average);
- a log line with more than the five fields (six with `reason` for `invalid_output`) or with any request content;
- the account not on Workers Free, or a new charge in Billing;
- the Workers Logs volume close to the Free allowance ([OPERATIONS.md](OPERATIONS.md) section 7).

Whether preview and production shared the Neuron allowance no longer matters, because the preview environment was removed; the allowance is per account (section 4, "Budget"). Enabling AI on production is a separate owner decision under this runbook, taken only after this record exists.

## 3. Limiter check with AI disabled (separate approval)
The limiters can be checked on a deployment with `AI_ASSIST_ENABLED` `"false"`: no model is called and nobody can use AI during the check. This works because, since Phase 11, the public Worker consults `AI_CLIENT_RATE_LIMITER` and then the quota Durable Object `AI_CLIENT_LIMITER` (ADR-029) before the kill switch.

- Requests refused by a limiter answer 429 `rate_limited` (since Phase 14 with `limit` `window` and `retryAfter`, and a `rate_limited_window` line).
- The others answer 503 `ai_unavailable` and write a `disabled` line.
- Each run also counts toward the address's daily quota of 30 (two runs use 10).
- Each request counts toward the Workers Free daily request limit (negligible here).
- The deployment and the check each need the owner's approval.
- It ran on preview on 2026-10-25 ("Phase 11 verification log") and on production in Phase 14 ("Phase 14 verification log"). Since the preview environment was removed on 2026-10-31, a repeat runs on production.

Steps:
1. Deploy the commit to check to production with `AI_ASSIST_ENABLED` `"false"`: the owner pushes it to `main` ([DEPLOYMENT.md](DEPLOYMENT.md) section 5).
   - Confirm in the build log (or the local dry run) that `AI_CLIENT_RATE_LIMITER` (5 per 60 s) and the Durable Object `AI_CLIENT_LIMITER` (`AiClientLimiter`) are present.
   - The first deployment with the Durable Object applies its migration `v1` (`new_sqlite_classes`). Removing the class later needs a `deleted_classes` migration.
2. Wait at least 60 s after any other AI request from the same address (including `scripts/check-deployment.mjs`).
3. Run A, one connection: 15 requests in one `curl` call, which reuses the connection (`num_connects` is 1 for the first request and 0 for the others). `-4` keeps the requests on IPv4, so they share one key:

   ```bash
   URL=https://travel-discovery.apps.musica-sanare.com; args=(); for i in $(seq 1 15); do args+=("$URL/api/ai/explanations" -o /dev/null); done; curl -4 -s -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "${args[@]}"
   ```

4. Wait at least 60 s, then run B, a new connection per request:

   ```bash
   URL=https://travel-discovery.apps.musica-sanare.com; for i in $(seq 1 15); do curl -4 -s -o /dev/null -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "$URL/api/ai/explanations"; done
   ```

5. Wait at least 60 s, then run `node scripts/check-deployment.mjs <account subdomain> production`. Its AI checks expect 503 and, since Phase 14, `GET /api/ai/status` answering `{"enabled":false}`.
6. Owner, Observability of `travel-discovery`:
   - Count the `rate_limited_window` (before Phase 14 `rate_limited`) and `disabled` lines of runs A and B. They should match the 429 and 503 counts.
   - In the dashboard, note the Durable Object requests and rows written, and whether the Worker's request count includes the Durable Object calls (ADR-029, 要確認).

**Record** in [DECISIONS.md](../working/DECISIONS.md) (the current phase's verification log) the version ID and, per run, the sequence of status codes and connection counts; never the address.

**Interpretation.** With the quota Durable Object, both runs must answer exactly five 503 and then 429, because one object counts every request of the address.
- More than five 503 in either run, or no 429, is a failure: keep AI disabled and record it.
- For comparison, without the Durable Object (2026-10-25), the binding alone gave 429 only in run A: counts are not shared for requests on new connections.
- Do not send more than the two runs of 15 requests without a new decision.

## 4. Enabling AI on production (separate approval)
AI stays disabled on production until the owner approves these steps for a date. This section was prepared on 2026-10-31 (Phase 14) at the owner's request; it is the plan, not an approval. The recommendation is to do it after the dated Workers Logs and Billing check of the first week of December 2026 ([OPERATIONS.md](OPERATIONS.md) section 3).

**Preconditions:**
- ADR-026 "Readiness for enabling AI" lists no item as not met.
- Billing lists only the domain registration and the plan is Free ([OPERATIONS.md](OPERATIONS.md) section 3).
- Workers Logs is on for `travel-discovery` with invocation logs off.
- The production quota Durable Object is deployed (version `cc06950d` or later).

**What changes for users.** The production URL is public, so unlike the preview trial there is no short window: anyone can use AI within the limits.
- The plan page shows the toggle as usable (`/api/ai/status` answers `{"enabled":true}`).
- Each client gets at most 5 AI requests per 60 s and 30 per UTC day (ADR-029).
- The deterministic results do not change.

**Budget.**
- Workers Free includes 10,000 Neurons per day, reset at 00:00 UTC, after which calls fail without a charge. The allowance is per account, so other projects on the account would share it *(要確認)*.
- At the measured 7–14 Neurons per call (the trial: about 11.8), that is roughly 700–1,400 calls per day.
- One address can use at most about 420 Neurons per day (worst case about 3,150).
- There is no app-wide daily cap (ADR-029 "Not covered"). Many addresses together can use the whole allowance, after which AI is unavailable for everyone until 00:00 UTC.

Steps:
1. Owner: confirm the preconditions, and note the Workers AI Neurons already used today.
2. Enable AI on the public production Worker only:
   - Set `AI_ASSIST_ENABLED: "true"` in `env.production` only (`wrangler.jsonc`) and commit on `dev` (owner-approved).
   - Run `npm run check` locally, and optionally the local dry run with `CLOUDFLARE_ENV=production` ([DEPLOYMENT.md](DEPLOYMENT.md) section 5). It must show the production database, `AI_ASSIST_ENABLED` `"true"`, `AI_CLIENT_RATE_LIMITER` 5 per 60 s, and `AI_CLIENT_LIMITER (AiClientLimiter)`.
   - Owner: push `dev` (CI only) and wait for green CI.
   - Owner: fast-forward `main` to that commit and push it ([DEPLOYMENT.md](DEPLOYMENT.md) section 5, step 4). This is the moment AI is enabled on production. Both production Workers are deployed; the admin Worker gets the same commit without any change of its own.
   - Check the same values in the build log of `travel-discovery`. Record the version ID and the time.
3. Check (about 4 model calls):
   - `GET /api/ai/status` answers `{"enabled":true}`.
   - `scripts/check-deployment.mjs <account subdomain> production` passes except its AI checks, which fail by design while AI is enabled (status `{"enabled":true}` and no 503).
   - In the built-in browser, answer one complete quiz in each of `ja`, `en`, `es`, and `fr` with the AI toggle on, at least 60 s apart.
   - Each note is labelled as AI-written, and the card order and the deterministic texts are the same as with AI off.
   - The owner reviews the notes as in section 2 step 6.
4. Monitoring (owner): about one hour after step 2, at the end of that UTC day, then daily for the first week, then with the weekly routine checks. Read:
   - Workers AI: Neurons used today.
   - Observability of `travel-discovery`: counts of the `ai_explanation` outcomes (`ok`, `invalid_output` with its `reason`, `timeout`, `provider_error`, `content_mismatch`, `rate_limited_window`, `rate_limited_daily`, `limiter_unavailable`) and the `ok` latencies. Every line has the five fields (six for `invalid_output`) and no request content.
   - The Worker's daily requests against the Workers Free 100,000, Durable Object errors, and Billing.
5. Record in [DECISIONS.md](../working/DECISIONS.md): the date, version IDs, Neurons before and after step 3, the outcome counts of each monitoring reading, and the owner's review of the notes, without copying notes into the repository.

**Stop at once** (disable as below, without finishing the other steps) when:
- Neurons used exceed 7,000 (70% of the daily allowance) before 12:00 UTC;
- Billing shows any new charge or a plan other than Free;
- on a day with at least 10 model calls, more than 20% end in `invalid_output`, `timeout`, or `provider_error`;
- a note contains a price, date, ranking, comparison, or a fact not in the destination's text;
- a log line has more fields than above or any request content;
- `limiter_unavailable` lines appear (the quota failed, so AI already fails closed);
- the Worker's requests pass 70,000 in a day;
- anything else unexpected appears in the logs or the Billing page.

The diagnosis keeps working throughout.

**Disable.**
- **Fast path** (owner, dashboard): Workers & Pages → `travel-discovery` → Settings → Variables *(要確認: exact labels)*, set `AI_ASSIST_ENABLED` to `false`.
  - It applies to new requests immediately. The plan page shows AI as off within a minute (the status may be cached for 60 s).
  - A dashboard edit is overwritten by the next build's deployment, and any push to `main` starts one. So then set `"false"` in `env.production`, commit on `dev`, and push `dev` and then `main` before anything else is pushed to `main`. Until that commit is on `main`, a push of any other commit to `main` re-enables AI.
- **Normal path:** the same commit and pushes without the dashboard edit.
- Either way, confirm with `scripts/check-deployment.mjs <account subdomain> production` that `/api/ai/status` answers `{"enabled":false}` and the AI endpoint 503 `ai_unavailable`, and record the time.
