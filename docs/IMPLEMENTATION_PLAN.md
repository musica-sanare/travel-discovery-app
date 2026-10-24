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

`prompts/FIRST_MESSAGE.md` is the kickoff message for a new Claude Code session.

## Phase 0 — Architecture verification and bootstrap
- Inspect repository and existing files.
- Verify current official Cloudflare docs for React/Vite/Workers, D1, AI, and Access.
- Verify current compatibility for framework/tool versions and package manager.
- Write `docs/DECISIONS.md` with choices, rationale, alternatives, and unresolved questions.
- Choose and configure the i18n library; scaffold locale resources for `ja`, `en`, and `es`.
- Scaffold minimal app and local dev scripts.
- Ensure local app starts and production build works.

Acceptance:
- Reproducible install using committed lockfile.
- TypeScript strict mode.
- Lint, type-check, test, and build scripts exist.
- No production resource created without approval.

## Phase 1 — Database and admin access
- Define schema and migrations, including `ja`/`en`/`es` translation tables (see `docs/DATA_MODEL.md`).
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
- Add rate limiting for admin API endpoints (deferred from Phase 1; `docs/DECISIONS.md` ADR-020) together with the AI endpoint limits.

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
- Write the operations runbook (`docs/OPERATIONS.md`).
- Prepare the AI enablement decision; the decision itself is the owner's.

Acceptance:
- Every open check is verified, or recorded as 要確認 with a reason.
- `docs/OPERATIONS.md` exists and covers monitoring, incidents, and the AI kill switch.
- CI runs E2E tests, or the reason it does not is recorded.
- AI remains disabled in all environments.

## Phase 8 — Content enrichment and billing safeguards
- Decide how existing destinations are updated (admin forms or an update mode for the Import page). *Decided 2026-10-24: an opt-in update mode for destinations (`docs/DECISIONS.md` ADR-028 "Update mode").*
- Add sourced indicative costs, best months, and, if the owner approves, licensed images to the published content.
- Review, then import on preview and production; answer full quizzes in English and Spanish.
- Add a monthly billing check and the list of charge-starting dashboard actions to the runbook; re-check Workers Logs pricing before 2026-12-01.

Acceptance:
- Every added fact has a cited source or license; nothing is guessed.
- The owner approved the review copy; the content is imported on both environments with bookmarks recorded.
- The runbook contains the billing check, and the Workers Logs pricing check is dated.
- AI stays disabled and the account stays on Workers Free.

## Phase 9 — Source-currency costs, dated operations checks, and an AI trial plan
- Record the daily Workers Logs volume and re-check the pricing pages in the last week of November 2026 (before 2026-12-01).
- Add `USD` and `EUR` estimates where the verified source publishes that currency, without conversion; review, then import on preview and production.
- Search again, time-boxed, for the empty costs with a likely candidate.
- Document the preview AI trial plan for the owner's decision; AI stays disabled.

Acceptance:
- The log volume and the pricing re-check are recorded with dates before 2026-12-01.
- Every added estimate matches its source's currency and figures; quizzes with `USD` and `EUR` budgets compare at least one destination on both environments.
- The AI trial plan is in `docs/DEPLOYMENT.md` 7.1, AI stays disabled, and the account stays on Workers Free.
