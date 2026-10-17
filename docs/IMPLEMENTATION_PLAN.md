# Implementation Plan

Each phase is started with the matching prompt file:

| Phase | Prompt file(s) |
|---|---|
| 0 — Architecture verification and bootstrap | `prompts/00-bootstrap.md` |
| 1 — Database and admin access | `prompts/01-foundation.md` |
| 2 — Deterministic diagnostic engine | `prompts/02-diagnostic-engine.md` |
| 3 — Public UI, localization, and outbound search | `prompts/03-public-ui.md` |
| 4 — Optional AI assistance | `prompts/04-ai-assist.md` |
| 5 — Quality and release | `prompts/05-polish-and-e2e.md`, then `prompts/06-release.md` |

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

## Phase 5 — Quality and release
- Add Playwright E2E tests for quiz and admin authorization.
- Add GitHub Actions for lint, type-check, tests, and build.
- Review accessibility, security, error messages, dependencies, and secrets.
- Add rate limiting for admin API endpoints (deferred from Phase 1; `docs/DECISIONS.md` ADR-020) together with the AI endpoint limits.
- Write README and deployment runbook.
- Deploy only after user approval and with documented free-tier/billing implications.

Acceptance:
- CI passes from a clean checkout.
- A new developer can follow README to run locally.
- Production deployment is repeatable.
- No secrets or personal data are committed.
