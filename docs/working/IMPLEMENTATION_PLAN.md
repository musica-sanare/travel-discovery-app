[Docs index](../en/README.md)

# Implementation Plan

Each phase is started with the matching prompt file:

| Phase | Prompt file(s) |
|---|---|
| 0 — Architecture verification and bootstrap | `prompts/00-bootstrap.md` |
| 1 — Database and admin access | `prompts/01-foundation.md` |
| 2 — Deterministic diagnostic engine | `prompts/02-diagnostic-engine.md` |
| 3 — Public UI, localization, and outbound search | `prompts/03-public-ui.md` |
| 4 — Optional AI assistance | `prompts/04-ai-assist.md` |
| 5 — Quality, accessibility, and end-to-end coverage | `prompts/05-polish-and-e2e.md` |
| 6 — Documentation, CI, and release | `prompts/06-release.md` |
| 7 — Post-launch operations | `prompts/07-operations.md` |
| 8 — Content enrichment and billing safeguards | `prompts/08-content-enrichment.md` |
| 9 — Source-currency costs, dated operations checks, and an AI trial plan | `prompts/09-currency-and-ai-trial.md` |
| 10 — Preview AI trial, a rollback check, and a content re-check | `prompts/10-ai-trial-and-operations-checks.md` |
| 11 — Trial log details, the AI client limiter, and development dependencies | `prompts/11-limiter-and-dependencies.md` |
| 12 — More attributes and questions for a more varied quiz | `prompts/12-attributes-and-questions.md` |
| 13 — More destinations | `prompts/13-more-destinations.md` |
| 14 — AI notices and limits in the UI, and production readiness for AI | `prompts/14-ai-ux-and-production-readiness.md` |
| 15 — Discrimination-based question selection and early stopping | `prompts/15-question-selection-and-early-stopping.md` |
| 16 — Cost and season coverage | `prompts/16-cost-and-season-coverage.md` |
| 17 — French locale | `prompts/17-french-locale.md` |

`prompts/FIRST_MESSAGE.md` is the kickoff message for a new Claude Code session.

## Phase 0 — Architecture verification and bootstrap
- Inspect repository and existing files.
- Verify current official Cloudflare docs for React/Vite/Workers, D1, AI, and Access.
- Verify current compatibility for framework/tool versions and package manager.
- Write [DECISIONS.md](DECISIONS.md) with choices, rationale, alternatives, and unresolved questions.
- Choose and configure the i18n library; scaffold locale resources for `ja`, `en`, and `es`.
- Scaffold minimal app and local dev scripts.
- Ensure local app starts and production build works.

Acceptance:
- Reproducible install using committed lockfile.
- TypeScript strict mode.
- Lint, type-check, test, and build scripts exist.
- No production resource created without approval.

## Phase 1 — Database and admin access
- Define schema and migrations, including `ja`/`en`/`es` translation tables (see [DATA_MODEL.md](../en/DATA_MODEL.md)).
- Create local D1 config and seed workflow.
- Map platform quota/limit errors (e.g. D1 daily limits on Workers Free) to a generic, localized "temporarily unavailable" response.
- Create the separate admin Worker and implement admin access protection for its UI and APIs (Worker-level Access + in-Worker JWT validation; ADR-004). Keep the public Worker read-only (ADR-018).
- Implement question/destination/category/attribute CRUD.
- Validate payloads server-side.
- Test unauthorized access to every admin API endpoint.

Acceptance:
- Fresh local database can be migrated and seeded.
- Admin can create/edit/deactivate content.
- Unauthenticated admin mutations are rejected.
- Public endpoints expose only published safe fields.

## Phase 2 — Deterministic diagnostic engine
- Implement pure functions for question selection, adaptation, scoring, filters, normalization, and ranking.
- Document the scoring scale and stopping rule.
- Add deterministic random seed support for tests.
- Add tests for empty/partial answers, ties, missing data, inactive content, and min/max question limits.

Acceptance:
- Same input and data produce same ranking.
- Question selection avoids repetition and honors bounds.
- AI is not imported or required by the domain module.

## Phase 3 — Public UI, localization, and outbound search
- Build landing page, trip constraints, quiz, progress, back/edit/restart, results, and destination details.
- Implement the language switcher and localize all public/admin UI strings and seed content in Japanese, English, and Spanish.
- Add responsive design, keyboard accessibility, reduced-motion behavior, and loading/error states.
- Add safe outbound flight/hotel search links using verified URL patterns.
- Add clear labels that external sites open separately and prices are not live.

Acceptance:
- End-to-end main flow works on mobile and desktop viewport sizes.
- Language switching works throughout public and admin UI, with correct document language metadata and documented missing-translation behavior.
- Keyboard navigation is usable.
- Search links preserve only supported/validated parameters.

## Phase 4 — Optional AI assistance
- Add a visible user-controlled toggle, default OFF.
- When OFF, assert no AI request is made.
- Verify current Workers AI model availability, free allowance, and terms.
- Implement provider adapter, prompt, schema validation, limits, safe error handling, and deterministic fallback.
- Add tests for disabled, success, malformed output, unavailable model, quota/error, and timeout cases.

Acceptance:
- AI can be disabled without changing ranking.
- AI failure never blocks results.
- AI output cannot introduce new destinations or alter factual fields.
- User receives a useful fallback explanation.

## Phase 5 — Quality, accessibility, and end-to-end coverage
- Add Playwright E2E tests for quiz and admin authorization.
- Review accessibility, security, error messages, dependencies, and secrets.
- Add rate limiting for admin API endpoints (deferred from Phase 1; [DECISIONS.md](DECISIONS.md) ADR-020) together with the AI endpoint limits.

Acceptance:
- All automated checks pass, or any remaining failure is documented with reason and risk.
- A checklist of manual checks before deployment exists.
- No secrets or personal data are committed.

## Phase 6 — Documentation, CI, and release
- Add GitHub Actions for lint, type-check, tests, and build.
- Write README and deployment runbook.
- Deploy only after user approval and with documented free-tier/billing implications.

Acceptance:
- CI passes from a clean checkout.
- A new developer can follow README to run locally.
- Production deployment is repeatable.
- No secrets or personal data are committed.

## Phase 7 — Post-launch operations
- Publish production content through the admin console and verify it in all locales.
- Close or document the remaining deploy-only checks.
- Run E2E tests in CI.
- Write the operations runbook ([OPERATIONS.md](../en/OPERATIONS.md)).
- Prepare the AI enablement decision; the decision itself is the owner's.

Acceptance:
- Every open check is verified, or recorded as 要確認 with a reason.
- [OPERATIONS.md](../en/OPERATIONS.md) exists and covers monitoring, incidents, and the AI kill switch.
- CI runs E2E tests, or the reason it does not is recorded.
- AI remains disabled in all environments.

## Phase 8 — Content enrichment and billing safeguards
- Decide how existing destinations are updated (admin forms or an update mode for the Import page). *Decided 2026-10-24: an opt-in update mode for destinations ([DECISIONS.md](DECISIONS.md) ADR-028 "Update mode").*
- Add sourced indicative costs, best months, and, if the owner approves, licensed images to the published content.
- Review, then import on preview and production; answer full quizzes in English and Spanish.
- Add a monthly billing check and the list of charge-starting dashboard actions to the runbook; re-check Workers Logs pricing before 2026-12-01.

Acceptance:
- Every added fact has a cited source or license; nothing is guessed.
- The owner approved the review copy; the content is imported on both environments with bookmarks recorded.
- The runbook contains the billing check, and the Workers Logs pricing check is dated.
- AI stays disabled and the account stays on Workers Free.

## Phase 9 — Source-currency costs, dated operations checks, and an AI trial plan
- Record the daily Workers Logs volume and re-check the pricing pages in the last week of November 2026 (before 2026-12-01). *Changed 2026-10-25 (owner decision): re-checked on 2026-10-25 instead; the check after 2026-12-01 is a dated operations task ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").*
- Add `USD` and `EUR` estimates where the verified source publishes that currency, without conversion; review, then import on preview and production.
- Search again, time-boxed, for the empty costs with a likely candidate.
- Document the preview AI trial plan for the owner's decision; AI stays disabled.

Acceptance:
- The log volume and the pricing re-check are recorded with dates before 2026-12-01.
- Every added estimate matches its source's currency and figures; quizzes with `USD` and `EUR` budgets compare at least one destination on both environments.
- The AI trial plan is in [DEPLOYMENT.md](../en/DEPLOYMENT.md) 7.1, AI stays disabled, and the account stays on Workers Free.

## Phase 10 — Preview AI trial, a rollback check, and a content re-check
- Run the preview AI trial of [DEPLOYMENT.md](../en/DEPLOYMENT.md) 7.1 if the owner decides to; otherwise record the decision. *Done 2026-10-25: run and recorded; blocked for production because `AI_CLIENT_RATE_LIMITER` returned no 429 (cause 要確認); AI disabled again ([DECISIONS.md](DECISIONS.md) "Phase 10 verification log").*
- Check on preview whether a Worker rollback also restores static assets. *Done 2026-10-25: it does, within about 20 s ([DEPLOYMENT.md](../en/DEPLOYMENT.md) section 8).*
- Re-check the Buenos Aires tourism site for a recommended season. *Done 2026-10-25: all twelve months from the city's tourist board, imported on both environments as `content/initial-v4.json`.*
- Not in this phase: the check after the Observability pricing change of 2026-12-01, which is a dated operations task ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").

Acceptance:
- The AI trial is recorded as 7.1 requires, or the owner's decision not to run it is recorded; AI is disabled in every environment at the end, and the account stays on Workers Free.
- The rollback question in [DEPLOYMENT.md](../en/DEPLOYMENT.md) section 8 is answered or recorded as 要確認 with the reason.
- Any content change is reviewed, imported on both environments with bookmarks, and `npm run check` and `npm run test:e2e` pass.

Status: **complete (2026-10-25)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 10 verification log"). Open items for later phases, each needing the owner's decision:
- Why `AI_CLIENT_RATE_LIMITER` did not refuse requests on preview (要確認); production AI stays blocked until this is resolved (ADR-026 "Readiness for enabling AI"). *Resolved 2026-10-25 in Phase 11: the binding does not count requests on new connections together; a strict quota Durable Object (ADR-029) passed the preview check.*
- The trial's per-request log outcomes and latencies, including the failed `en` request, were not recorded (要確認). *Recorded 2026-10-25 in Phase 11: four `ok`, the `en` request `invalid_output` ([DECISIONS.md](DECISIONS.md) "Phase 10 verification log").*
- `npm audit` lists high-severity advisories in development-only dependencies (`undici` in `miniflare`, a nested `zod` in `@cloudflare/vitest-plugin`) besides the known `esbuild` one (ADR-003); `npm audit --omit=dev` reports none. *Resolved 2026-10-25 in Phase 11 with scoped overrides (ADR-030); the `esbuild` chain stays held.*
- Still deferred from the Phase 10 prompt: production AI, images, a dated exchange-rate table, the out-of-policy Access check, other empty costs, and the pre-public-release checklist.

## Phase 11 — Trial log details, the AI client limiter, and development dependencies
- Record the preview AI trial's per-request log outcomes before Workers Logs retention ends (about 2026-10-28 06:18 UTC).
- Find out why `AI_CLIENT_RATE_LIMITER` did not refuse requests on preview; fix and verify it with the owner's approval, or record what was ruled out.
- Resolve or justify the development-only `npm audit` advisories with owner-approved dependency updates.
- Not in this phase: production AI and the check after the Observability pricing change of 2026-12-01 (a dated operations task, [OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").

Acceptance:
- The trial's log outcomes are recorded, or their loss is recorded as 要確認.
- The missing 429 is explained with evidence and fixed and verified, or recorded as 要確認; ADR-026 "Readiness for enabling AI" reflects the result, and AI is disabled in every environment.
- `npm audit --omit=dev` reports none, and every remaining advisory is fixed or held with a recorded reason.
- `npm run check` and `npm run test:e2e` pass after any change, and the account stays on Workers Free.

Status: **complete (2026-10-25)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 11 verification log"):
- Trial log outcomes recorded in the "Phase 10 verification log": four `ok`, the failed `en` request `invalid_output`.
- Missing 429 explained: the Rate Limiting binding does not count requests that each arrive on a new connection together. Fixed with a strict per-client quota in a Durable Object on Workers Free (5 per 60 s and 30 per UTC day per address, fail closed; ADR-029), consulted before the kill switch so it is verifiable with AI disabled. On preview (version `a0b632c4`) both runs answered exactly five 503 and then 429. ADR-026 A.2 is met on preview; AI is disabled in every environment.
- Development advisories: `undici` and the nested `zod` fixed with scoped overrides (ADR-030); `npm audit --omit=dev` reports 0; the `esbuild` chain stays held (ADR-003).
- `npm run check` (697 tests) and `npm run test:e2e` passed after every change; no paid plan or feature was enabled.

Open items for later phases, each needing the owner's decision or check:
- Dashboard readings for the preview checks (要確認): the `rate_limited` and `disabled` line counts of the 7.2 runs, the Durable Object requests and rows written, and whether the Worker's request count includes the Durable Object calls (ADR-029). Whether Cloudflare stores Durable Object names is not documented (要確認).
- Production does not have the quota Durable Object yet: deploying it (the first deployment applies the migration `v1`) and enabling production AI are separate owner decisions (ADR-026 "Readiness for enabling AI").
- Which output check rejected the trial's `en` response, and what sent the 400 request at 06:26:44Z (要確認, "Phase 10 verification log"); the log line deliberately has no reason field.
- Clients that change addresses are bounded only by the daily Neuron ceiling; an app-wide daily cap remains an option (ADR-029 "Not covered").
- Remove the overrides once the Cloudflare packages depend on fixed versions (ADR-030).
- Dated, outside the phases: the Workers Logs and Billing check in the first week of December 2026 ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").
- Still deferred: images, a dated exchange-rate table, the out-of-policy Access check, other empty costs, and the pre-public-release checklist.

## Phase 12 — More attributes and questions for a more varied quiz
Owner decision (2026-10-25): next come more attributes and questions (Phase 12), then more destinations (Phase 13), then the AI notices and limits in the UI together with production readiness for AI (Phase 14). Phases 13 and 14 get their own prompt files when they start.
- Measure the current quiz variety with a deterministic local simulation (distinct question sets, overlap, how often each question and destination appears).
- Propose 3–5 new attributes with definitions and a scoring rubric, scores for the 18 published destinations, and new questions to reach about 30; the owner reviews a rendered copy in `ja`, `en`, and `es`.
- Build `content/initial-v5.json` from the approved items, compare the simulation with the baseline, and propose any change of the quiz settings (the owner changes them in the admin console).
- Import on preview, then production, with Time Travel bookmarks and checks in all three locales.
- Not in this phase: new destinations, AI UI changes, deploying the quota Durable Object to production, production AI, and discrimination-based question selection.

Acceptance:
- Baseline and after-change simulation numbers are recorded, with clearly more distinct question sets after the change.
- The owner approved the new attributes, scores, and questions, and `initial-v5.json` differs from `initial-v4.json` only by them.
- The bundle is imported on both environments with bookmarks and matches `/api/diagnosis-content` in all three locales; complete quizzes work in all three locales.
- `npm run check` and `npm run test:e2e` pass after any change, AI is disabled in every environment, and the account stays on Workers Free.

Status: **complete (2026-10-25)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 12 verification log"):
- Simulation: `npm run quiz:simulate` (opt-in, local, deterministic; `test/simulation/`). With 1,000 sessions at the default settings, `initial-v4.json` gave 64 distinct question sets and 8.43 shared questions per pair of sessions; `initial-v5.json` gives 1,000 and 3.59.
- Content: `content/initial-v5.json` adds four attributes (`warm-climate`, `nightlife`, `easy-getting-around`, `art-architecture`), their scores for the 18 destinations, and 17 questions, for 11 attributes and 29 published questions. The existing 12 questions are unchanged. The owner approved a rendered review copy in `ja`, `en`, and `es` (ADR-028).
- Imported with the update mode on preview and production with Time Travel bookmarks. `/api/diagnosis-content` matches the bundle in all three locales on both, and complete quizzes were answered in all three locales on both. The first preview import did not reach the database and was repeated.
- Quiz settings unchanged at 6/10/12/5, as proposed.
- `npm run check` (717 tests) and `npm run test:e2e` passed after every code change; AI is disabled in every environment and no paid plan or feature was enabled.

Open items for later phases, each needing the owner's decision or check:
- Why the first preview import did not reach the database (要確認, "Phase 12 verification log").
- Rome (7.8%) and Seoul (14.8%) still rarely reach the top 5 in the simulation, because of their existing scores; revisiting existing scores is a separate content decision.
- Discrimination-based question selection and stability-based early stopping can now be evaluated ([DIAGNOSTIC_ALGORITHM.md](../en/DIAGNOSTIC_ALGORITHM.md) §8); implementing them is a separate decision.
- The preview seed destinations `lisbon` and `south-iceland` are scored on the original 7 attributes only (preview only).
- Carried over from Phase 11: the dashboard readings (要確認), the production quota Durable Object and production AI, the trial's `en` rejection and the 400 request (要確認), an app-wide daily cap, and removing the overrides (ADR-030).
- Still deferred: images, a dated exchange-rate table, the out-of-policy Access check, other empty costs, and the pre-public-release checklist.
- Dated, outside the phases: the Workers Logs and Billing check in the first week of December 2026 ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").
- Next: Phase 13 (more destinations, `prompts/13-more-destinations.md`).

## Phase 13 — More destinations
Owner decision (2026-10-25, Phase 12 order): more destinations come after the attributes and questions of Phase 12, before the AI notices and limits in the UI (Phase 14).
- Review the coverage of the 18 destinations by region, type, and attribute profile, using `npm run quiz:simulate` for the top-result shares.
- Propose new city/region-level destinations (no Japan) to reach a total the owner approves; for each approved one, scores for all 11 attributes, texts in `ja`, `en`, and `es`, recommended days, and costs and best months only under the Phase 8 and Phase 9 source rules. The owner reviews a rendered copy.
- Keep existing content unchanged unless the owner approves a listed score change.
- Build `content/initial-v6.json`, compare the simulation with `initial-v5.json`, and propose any change of the quiz settings (the owner changes them in the admin console).
- Import on preview, then production, with Time Travel bookmarks, a check that the new content is served before the bookmark after the import, and checks in all three locales.
- Not in this phase: new attributes or questions, AI UI changes, deploying the quota Durable Object to production, production AI, discrimination-based question selection, and images unless the owner decides otherwise.

Acceptance:
- Coverage review and before/after simulation numbers are recorded, and every published destination reaches the top results in the after-change simulation.
- The owner approved the new destinations and any score changes, `initial-v6.json` differs from `initial-v5.json` only by them, and every cost and best-month entry has a cited source.
- The bundle is imported on both environments with bookmarks and matches `/api/diagnosis-content` in all three locales; complete quizzes work in all three locales.
- `npm run check` and `npm run test:e2e` pass after any change, AI is disabled in every environment, and the account stays on Workers Free.

Status: **complete (2026-10-31)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 13 verification log"):
- Coverage: the 18 destinations of `initial-v5.json` had no destination in mainland North America, Central America and the Caribbean, Africa, the Middle East, the Nordic countries, Central and Eastern Europe, South Asia, or New Zealand, and none combining strong nature with easy travel.
- Content: `content/initial-v6.json` adds 8 countries and 12 destinations, for 23 countries and 30 published destinations; existing content is unchanged (the proposed Rome and Seoul score changes were not chosen). Costs for two new destinations and best months for eight follow the Phase 8 and Phase 9 rules; the others are empty. The owner approved a rendered review copy in `ja`, `en`, and `es` (ADR-028).
- Simulation (1,000 sessions, default settings): top-5 shares from `riviera-maya` 35.3% to `rome` 2.9% (`initial-v5.json`: `barcelona` 47.6% to `rome` 7.8%); every destination reaches the top 5.
- Imported with the update mode on preview and production with Time Travel bookmarks, each on the first attempt. `/api/diagnosis-content` matches the bundle in all three locales on both, and complete quizzes were answered in all three locales on both.
- Quiz settings unchanged at 6/10/12/5, as proposed.
- `npm run check` (724 tests) and `npm run test:e2e` passed after the code change; AI is disabled in every environment and no paid plan or feature was enabled.

Open items for later phases, each needing the owner's decision or check:
- Rome reaches the top 5 in only 2.9% of simulated sessions; revisiting existing scores is a separate content decision.
- Marrakech has no best months or best-season text (the official page could not be read); ten new destinations have no cost estimate.
- Carried over: why the first Phase 12 preview import did not reach the database (要確認; both Phase 13 imports reached it on the first attempt), discrimination-based question selection and early stopping, the preview seed destinations scored on 7 attributes, the Phase 11 dashboard readings (要確認), the production quota Durable Object and production AI, the trial's `en` rejection and the 400 request (要確認), an app-wide daily cap, and removing the overrides (ADR-030).
- Still deferred: images, a dated exchange-rate table, the out-of-policy Access check, other empty costs, and the pre-public-release checklist.
- Dated, outside the phases: the Workers Logs and Billing check in the first week of December 2026 ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").
- Next: Phase 14 (the AI notices and limits in the UI and production readiness for AI, `prompts/14-ai-ux-and-production-readiness.md`).

## Phase 14 — AI notices and limits in the UI, and production readiness for AI
Owner decision (2026-10-25, Phase 12 order): the AI notices and limits in the UI and production readiness for AI come after more destinations (Phase 13).
- List every AI state the public UI can show and what it tells the user in `ja`, `en`, and `es`, checked locally with the AI endpoint mocked.
- Propose changes to the AI notices, limits, and status (for example stating the limits before use, telling the window limit apart from the daily limit, and showing whether AI is available for the site), each with its contract, privacy, and cost impact; implement only the approved ones, with tests and a rendered review copy of the texts.
- Deploy the quota Durable Object (ADR-029) to production with AI disabled, run the [DEPLOYMENT.md](../en/DEPLOYMENT.md) 7.2 check there, and record the owner's dashboard readings.
- Update ADR-026 "Readiness for enabling AI" and record the owner's production AI decision; enabling AI on production needs its own written steps and approval.
- Not in this phase: content changes, discrimination-based question selection, images, a dated exchange-rate table, the out-of-policy Access check, removing the overrides (ADR-030), and the pre-public-release checklist.

Acceptance:
- The current AI states are listed, and the owner decided on each proposed change.
- Approved changes are implemented with tests, and the owner approved a rendered review copy of the new texts in all three locales.
- Production runs the quota Durable Object with AI disabled, the 7.2 check passed on production, and the owner's dashboard readings are recorded or stay 要確認 with a reason.
- ADR-026 "Readiness for enabling AI" is up to date, and the owner's production AI decision is recorded.
- `npm run check` and `npm run test:e2e` pass after any change, AI is disabled in every environment unless the owner decided otherwise, and the account stays on Workers Free.

Status: **complete (2026-10-31)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 14 verification log"):
- AI states: one "busy" notice for every 429, no hint of the limits or of AI being off for the whole site, and a footer that said answers are never sent; checked locally in 84 runs with the AI endpoint mocked.
- Adopted and implemented (commit `b361260`): the limits next to the toggle; `GET /api/ai/status`, which disables the toggle while AI is off; a 429 that names the window or daily limit with `Retry-After`, and matching notices; a `reason` for `invalid_output` in the log line; a corrected footer (ADR-026 "Phase 14 amendments", ADR-029). Not adopted: an app-wide daily cap.
- Deployed with AI disabled to preview (`f8b5bef7`) and production (`cc06950d`, with the Durable Object migration `v1`); the 7.2 check passed on both (five 503, then 429, on one connection and on new connections).
- ADR-026 "Readiness for enabling AI" lists no item as not met. Owner decision: the production steps are prepared ([DEPLOYMENT.md](../en/DEPLOYMENT.md) 7.3) and AI stays disabled until the owner approves them for a date.
- `npm run check` (760 tests) and `npm run test:e2e` (64 passed) passed; no paid plan or feature was enabled.

Open items for later phases, each needing the owner's decision or check:
- Enabling AI on production with [AI_ENABLEMENT.md](../en/AI_ENABLEMENT.md) section 4 (recommended after the December check).
- Durable Object dashboard readings: 22 requests shown per object where 31 checks were made, rows written, and whether the Worker's request count includes the Durable Object calls (要確認).
- Carried over: the trial's `en` rejection and the 400 request (要確認), why the first Phase 12 preview import did not reach the database (要確認), whether preview and production share the Neuron allowance (要確認), a manual retry for AI notes, an app-wide daily cap before any move to Workers Paid, Rome's top-5 share, the preview seed data, and removing the overrides (ADR-030).
- Still deferred: images, a dated exchange-rate table, the out-of-policy Access check, other empty costs and best months, and the pre-public-release checklist.
- Dated, outside the phases: the Workers Logs and Billing check in the first week of December 2026 ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").
- Next: Phase 15 (discrimination-based question selection and early stopping, `prompts/15-question-selection-and-early-stopping.md`).

## Phase 15 — Discrimination-based question selection and early stopping
Owner decision (2026-10-31): after Phase 14, evaluate the deferred discrimination-based selection and early stopping ([DIAGNOSTIC_ALGORITHM.md](../en/DIAGNOSTIC_ALGORITHM.md) §8), whose content condition is met; enabling AI on production ([DEPLOYMENT.md](../en/DEPLOYMENT.md) 7.3) is planned for after the December Workers Logs and Billing check.
- Record the baseline with `npm run quiz:simulate` on `content/initial-v6.json`.
- Propose an opt-in, local, deterministic evaluation with simulated respondents who answer consistently with a hidden preference profile, and agree on the measures with the owner before comparing.
- Compare the §8 candidates (and justified variants) with the baseline; recommend one option, which may be "change nothing".
- Implement only the approved option with tests and a rendered review copy of any new texts; deploy to preview, then production, with complete quizzes in all three locales.
- Not in this phase: content changes, new attributes, production AI, a manual AI retry, an app-wide AI cap, images, a dated exchange-rate table, the out-of-policy Access check, removing the overrides (ADR-030), and the pre-public-release checklist.

Acceptance:
- The baseline and the evaluation method are recorded, and the owner approved the method before the candidates were compared.
- The candidates are compared on the agreed measures, and the owner decided on the recommended option.
- Approved changes are implemented with tests, selection stays deterministic, and the owner approved a rendered review copy of any new texts in all three locales.
- If code changed, it is deployed to preview and production with complete quizzes checked in all three locales and recorded in the "Phase 15 verification log".
- `npm run check` and `npm run test:e2e` pass after any change, AI is disabled in every environment, and the account stays on Workers Free.

Status: **complete (2026-10-31)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 15 verification log"):
- Baseline and method: random-answer variety as in Phase 13; an opt-in evaluation with simulated respondents who answer from a hidden profile (`npm run quiz:simulate`), approved by the owner before the comparison.
- Comparison: discrimination-weighted selection raised the overlap with the respondents' ideal top 5 by 0.05–0.10 and lowered the fit loss by 0.29–0.42 points, consistently in both profile families and on both seeds; early stopping saved 0.1–0.8 questions on average and lowered quality.
- Adopted and implemented (commit `47ea787`, ADR-031): discrimination-weighted selection; not adopted: early stopping. No UI text, setting, or migration changed.
- Deployed with AI disabled to preview (`a378ee7d`) and production (`15c9fbe6`); `scripts/check-deployment.mjs` and complete quizzes in `ja`, `en`, and `es` passed on both.
- `npm run check` (783 tests) and `npm run test:e2e` (64 passed) passed; no paid plan or feature was enabled.

Open items for later phases, each needing the owner's decision or check:
- Enabling AI on production with [AI_ENABLEMENT.md](../en/AI_ENABLEMENT.md) section 4 (recommended after the December check).
- Whether to ask 12 instead of 10 questions: the evaluation shows a gain similar to that of discrimination; a quiz-settings change in the admin console (owner).
- The spread of top-5 shares widened slightly with discrimination (Rome lowest, 2.1% with random answers).
- Carried over from Phase 14: the Durable Object dashboard readings, the trial's `en` rejection and the 400 request, the first Phase 12 preview import, Neuron sharing (all 要確認), a manual retry for AI notes, an app-wide daily cap, the preview seed data, and removing the overrides (ADR-030).
- Still deferred: images, a dated exchange-rate table, the out-of-policy Access check, other empty costs and best months, and the pre-public-release checklist.
- Dated, outside the phases: the Workers Logs and Billing check in the first week of December 2026 ([OPERATIONS.md](../en/OPERATIONS.md) section 3 "Dated").
- Next: Phase 16 (cost and season coverage, `prompts/16-cost-and-season-coverage.md`).

## Phase 16 — Cost and season coverage
Owner decision (2026-10-31): after Phase 15 and Phase 17 (French locale, done first by owner decision of the same day), extend the sourced cost estimates and best months, because only 8 of 30 destinations have a cost estimate and 18 have best months, so the budget and season notes are `unknown` for most destinations. Enabling AI on production follows in a later phase, after the December Workers Logs and Billing check. Documentation fixes are done separately before this phase.
- Inventory the gaps per destination with the rule that excluded each one in Phases 8, 9, and 13.
- Re-check sources within the current rules, time-boxed; propose rule options (for example converted `USD` and `EUR` estimates for `AUD` and `NZD` sources) for the owner's decision before adding values.
- Add only sourced values in `content/initial-v8.json` with a rendered review copy in all four locales; rehearse the import locally, then import on production (amended 2026-11-01: the preview environment was removed, ADR-033, and imports need no bookmark, OPERATIONS.md section 5).
- Not in this phase: new destinations, attributes, or questions; score or effect changes; the number of questions; production AI; images; the out-of-policy Access check; removing the overrides (ADR-030); and the pre-public-release checklist.

Acceptance:
- The gap inventory and re-check are recorded, and the owner decided on each rule option before any value was added.
- Every new value has a cited source that meets the approved rules; items without one stay empty.
- `content/initial-v8.json` differs from `initial-v7.json` only by the approved values, and the owner approved the rendered review copy.
- The bundle is imported in a local rehearsal and on production, matches `/api/diagnosis-content` in all four locales, and complete quizzes with `JPY`, `USD`, and `EUR` budgets pass on both.
- `npm run check` passes (and `npm run test:e2e` if code changed), AI is disabled in every environment, and the account stays on Workers Free.

Status: **complete (2026-11-01)**; every acceptance item, as amended on 2026-11-01, is met ([DECISIONS.md](DECISIONS.md) "Phase 16 verification log"):
- Rules: every destination with an estimate has `JPY`, `USD`, and `EUR`, converted at cited official annual average rates where the source uses another currency (ADR-008 update); Santorini and Bali use wider-area official figures stated in the basis.
- Content: `content/initial-v8.json` adds 17 cost estimates to `initial-v7.json`; 10 of 30 destinations have estimates (8 before), and no budget is `incomparable`. Best months are unchanged. Seoul stays empty (要確認: its 2025 report).
- Rollout: a local rehearsal replaced preview (ADR-033). Production already matched the bundle; `/api/diagnosis-content` matches in all four locales, and complete quizzes with `JPY`, `USD`, and `EUR` budgets pass locally and on production. Imports no longer need a Time Travel bookmark ([OPERATIONS.md](../en/OPERATIONS.md) section 5).
- No code changed; `npm run check` passed, AI is disabled, and the account stays on Workers Free.

## Phase 17 — French locale
Owner decision (2026-10-31): add French (`fr`) to the public UI, the admin UI, and all published content, before Phase 16. Started with the shared `add-ui-locale` task prompt; the plan below was approved by the owner on the same day (ADR-032).
- Add `fr` to the supported locales with the fallback `fr → en → ja`, and derive every hard-coded locale list from `shared/locales.ts`.
- Add migration `0002` that rebuilds the seven `*_translations` tables so their `locale` CHECK constraints accept `fr`, preserving all rows.
- Add complete `fr` catalogs for the public and admin UI, and the AI prompt's language name; AI stays disabled.
- Extend the admin Import update mode to existing countries, attributes, categories, and questions, so translations added to a bundle reach a deployed database through the admin API.
- Build `content/initial-v7.json`: `initial-v6.json` plus curated `fr` translations of every item and cost basis, with nothing else changed, and a rendered review copy.
- Extend locale-parameterized tests, the content bundle test, the seed check, and `scripts/check-deployment.mjs` to `fr`; check the main pages in `fr` in the built-in browser.
- Add `fr` to `CLAUDE.md` and to every stable doc that lists locales, with their Japanese twins.
- Not in this phase: other locales, a `docs/fr/` translation, evaluating AI output in French, new or changed content other than `fr` text, and Phase 16's cost and season work.

Acceptance:
- The owner approved the migration before it runs on preview or production, and it preserves every existing row (tested locally).
- UI strings are complete in `fr` (compile-time check and blank-string test); content falls back `fr → en → ja` and shows the "shown in <language>" hint.
- `content/initial-v7.json` differs from `initial-v6.json` only by `fr` translations, and the owner approved the rendered review copy.
- The main public and admin pages work in `fr` at 375 px and desktop width without missing keys or overflow, and switching between all four locales works.
- After the owner-approved migration and imports with Time Travel bookmarks, `/api/diagnosis-content` matches the bundle in all four locales on preview and production, and complete quizzes pass in `fr`.
- `npm run check` and `npm run test:e2e` pass, AI is disabled in every environment, and the account stays on Workers Free.

Status: **complete (2026-10-31)**; every acceptance item is met ([DECISIONS.md](DECISIONS.md) "Phase 17 verification log"):
- Code: `fr` in `shared/locales.ts` with the fallback `fr → en → ja`, French public and admin catalogs, migration `0002`, and the Import update mode for every item type (ADR-032, ADR-028 "Update mode").
- Content: `content/initial-v7.json` adds `fr` to every item and cost basis; with `fr` removed it equals `initial-v6.json`. The owner approved the rendered review copy.
- Rollout: migration `0002`, deployments, and the import ran on preview and then production with Time Travel bookmarks, each on the first attempt. `/api/diagnosis-content` matches the bundle in all four locales on both, and complete quizzes in `fr` work on both.
- `npm run check` (810 tests) and `npm run test:e2e` (75 passed, one mobile keyboard test skipped by design) passed after the last code change; AI is disabled in every environment and no paid plan or feature was enabled.

## Phase 18 — Public release preparation
Owner decision (2026-11-01): after Phase 16, work through the pre-public-release checklist ([PUBLIC_RELEASE.md](PUBLIC_RELEASE.md)) while enabling AI on production waits for the December Workers Logs and Billing check. Prompt: `prompts/18-public-release-preparation.md`.
- Inventory the history of every branch and tag to be published for committed private files and account identifiers, and decide for each whether it stays, moves out of the repository, or is removed.
- Scan the full history with a secret scanner after the owner approves installing it.
- Present license options for code and content, and check the dependencies' licenses; add a license only after the owner decides.
- Review third-party material and private notes, draft `SECURITY.md`, and describe the GitHub protections for `main` as owner steps.
- Not in this phase: making the repository public, rewriting history without the owner's instruction, production AI, images, new content, and the out-of-policy Access check.

Acceptance:
- Every branch and tag to be published is inventoried, and every identifier has an owner decision.
- A secret scan of the full history ran after approval, with its tool, command, and result recorded, and every finding resolved.
- The owner chose a license (or none, recorded), and no dependency license conflicts with it.
- Every PUBLIC_RELEASE.md item is checked, deferred with a reason, or not applicable, and the applied GitHub settings are recorded.
- `npm run check` and `npm run test:e2e` pass, `npm audit --omit=dev` reports no vulnerabilities, AI is disabled, and the account stays on Workers Free.

Status: **complete (2026-11-01)**; every acceptance item is met or deferred with a reason ([DECISIONS.md](DECISIONS.md) "Phase 18 verification log"):
- History: no private file, local path, real email address, or account ID in any commit; the D1 IDs, the Access team domain, and the AUD tags stay by owner decision. gitleaks 8.30.1 found four matches over 123 commits, none a secret.
- License: MIT for code, docs, and content (`LICENSE`); no dependency license conflicts. `SECURITY.md` is added and linked from the README.
- [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md): every item is checked or deferred with a reason. Deferred: README screenshots (optional) and the GitHub settings, which are owner steps right after publishing because GitHub Free offers them only for public repositories.
- `npm ci`, `npm run check` (816 tests), and `npm run test:e2e` passed; `npm audit --omit=dev` reports 0, and 16 moderate development-only advisories are held (ADR-003 `esbuild`, new `minimatch`). AI is disabled, and the account stays on Workers Free. Publishing is the owner's decision.

## Phase 19 — Results clarity and page basics
Owner decision (2026-11-03): after the custom domain went live (ADR-034), make the results easier to tell apart and add the page basics a real hostname needs. Prompt: `prompts/19-results-and-page-basics.md`.
- Add a deterministic "distinctive strengths" list to each result (wanted attributes where it is clearly stronger than the other shown results), as explanation data only; ranking and fit do not change.
- Show the strengths on the results page and show the external-search note once instead of on every card; the fit number stays.
- Add a description, canonical URL, and Open Graph tags to `index.html`, a localized description, an SVG favicon, a `robots.txt` that allows crawlers, and a footer link to the hub page `https://musica-sanare.com/`.
- Not in this phase: an `og:image`, a banded fit display, more cost estimates or destinations, images, shareable result URLs, and production AI.

Acceptance:
- Each result carries at most two strengths from one documented, tested rule, and ranking and fit values are unchanged.
- The results page shows the strengths in all four locales, and the external-search note appears once.
- `index.html` has the description, canonical, and Open Graph tags; the description follows the active locale; `/favicon.svg` and `/robots.txt` are real files.
- The footer links to the hub page.
- `npm run check` and `npm run test:e2e` pass, AI is disabled, and the account stays on Workers Free.

Status: **complete (2026-11-03)**; deployed with `dac3dba` and checked on production ([DECISIONS.md](DECISIONS.md) "Phase 19 verification log", ADR-035):
- Each result carries up to two distinctive strengths (margin 0.75 score points, from a simulation on `content/initial-v8.json`); ranking and fit are unchanged.
- The results page shows them and the external-search note once; `index.html` has the description, canonical URL, and Open Graph tags; the favicon, `robots.txt`, and the hub link are added.
- `npm run check` (826 tests) and `npm run test:e2e` (77 passed, one skipped by design) passed; AI is disabled, and the account stays on Workers Free.

## Phase 20 — Destination map
Owner decision (2026-11-08): add a map only if it is guaranteed free, before adding destinations and cost estimates (Phase 21), so that new destinations get coordinates from the start. Prompt: `prompts/20-destination-map.md`.
- Add optional `latitude` and `longitude` to destinations (migration, bundle, import, admin, content API), and coordinates for the 30 destinations in `content/initial-v9.json`, reviewed by the owner.
- Draw a world map from public-domain Natural Earth data into one static SVG served by the app, and show the shown results as numbered pins on the results page, with a text alternative. No tile server, map API, or key.
- Link each card with coordinates to an external map in a new tab.
- Not in this phase: new destinations and cost estimates (Phase 21), zoomable maps, images, shareable result URLs, and production AI.

Acceptance:
- Destinations have optional, validated coordinates through every layer, and the migration is backward compatible.
- `initial-v9.json` differs from `initial-v8.json` only by the reviewed coordinates.
- The results page shows the map with numbered pins and a text alternative in all four locales, and the map links work.
- No new external request, no CSP change, and the quiz pages do not load the map.
- `npm run check` and `npm run test:e2e` pass, AI is disabled, and the account stays on Workers Free.
- After the owner's migration, push, and import, production shows the map, checked without login.

Status: **implemented locally (2026-11-08)**; the owner reviews the coordinates, applies migration `0003` to production, pushes, and imports `content/initial-v9.json` ("Phase 20 verification log" in DECISIONS.md).

## Phase 21 — More destinations and cost estimates (planned)
Owner decision (2026-11-08): after Phase 20, add destinations in the regions with none or few (for example the Middle East, South Asia, sub-Saharan Africa, the UK, Portugal, and the Nordic countries), with coordinates, and fill more cost estimates and best months under the Phase 8 and Phase 9 source rules. The candidate list, the total, and the prompt are prepared when Phase 20 is complete.
