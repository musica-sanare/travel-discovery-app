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
- Why `AI_CLIENT_RATE_LIMITER` did not refuse requests on preview (要確認); production AI stays blocked until this is resolved (ADR-026 "Readiness for enabling AI").
- The trial's per-request log outcomes and latencies, including the failed `en` request, were not recorded (要確認). *Recorded 2026-10-25 in Phase 11: four `ok`, the `en` request `invalid_output` ([DECISIONS.md](DECISIONS.md) "Phase 10 verification log").*
- `npm audit` lists high-severity advisories in development-only dependencies (`undici` in `miniflare`, a nested `zod` in `@cloudflare/vitest-plugin`) besides the known `esbuild` one (ADR-003); `npm audit --omit=dev` reports none.
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
