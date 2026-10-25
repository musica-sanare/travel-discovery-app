# Prompt 01 — Database schema and secure admin foundation

Read `CLAUDE.md`, `docs/en/SPEC.md`, `docs/en/ARCHITECTURE.md`, `docs/en/DATA_MODEL.md`, `docs/working/DECISIONS.md`, and the Phase 0 report.

Implement the data layer and secure admin foundation only.

## Localization data
- Keep stable IDs/scoring fields separate from localized strings.
- Implement translation tables or another normalized, documented model for Japanese, English, and Spanish question, option, category, attribute, and destination text.
- Validate locale codes and document behavior for missing translations.

## Tasks
1. Implement schema, constraints, indexes, migrations, local D1 configuration, and reproducible seed workflow.
2. Use the accepted logical data model, adjusting only where current platform constraints require it. Document material changes.
3. Implement repository/data-access functions separate from route handlers.
4. Implement public read endpoints for published content.
5. Implement admin CRUD endpoints for questions, categories, options, score effects, destinations, attributes, and settings as scoped in the spec.
6. Protect admin UI and every admin API endpoint using the verified approach recorded in `docs/working/DECISIONS.md`.
7. Add server-side validation, safe error responses, and tests for unauthorized access.
8. Add a minimal functional admin UI sufficient to create/edit/deactivate content; visual polish can follow.
9. Do not store user quiz answers or history in the database.

## Security checks
- Hiding admin links or routes is not authorization.
- Test direct unauthenticated requests to every admin mutation endpoint.
- Verify that public endpoints never expose draft/archived content or admin-only metadata.
- Do not log secrets, credentials, or full request bodies.
- If Access identity validation is ambiguous, stop and ask rather than shipping a bypass.

## Acceptance
- Clean local database migration and seed succeeds.
- CRUD operations work and are validated.
- Unauthorized admin API requests are rejected.
- Tests cover publication filtering, validation failures, and authorization.
- Lint, type-check, tests, and build pass.
- Summarize changed files, commands/results, and any `要確認`. Do not proceed to quiz engine yet.
