# Prompt 08 — Content enrichment and billing safeguards

Production has 18 published destinations and 12 questions from `content/initial-v1.json` (ADR-028), without cost estimates, images, or best months. This phase adds sourced information to that content and two small operational safeguards. The first response is investigation and a plan only: no implementation, configuration change, or deployment.

Do not run remote Cloudflare commands, deploy, change account settings, push, commit, add dependencies, download browsers, enable AI, or enable any paid plan or feature without the owner's explicit approval for that action. Dashboard and Access changes are the owner's steps; describe them, do not perform them. The account must stay on Workers Free: the only accepted charge is the owner's existing domain registration.

## Read first
`CLAUDE.md`, `docs/en/OPERATIONS.md` (sections 7 and 8), `docs/working/DECISIONS.md` (ADR-008, ADR-021, ADR-028, "Phase 7 verification log", and "Open questions" item 6), `docs/en/DATA_MODEL.md` ("Phase 2 schema notes"), `docs/en/DIAGNOSTIC_ALGORITHM.md` sections 5–6, `docs/en/ARCHITECTURE.md` section 8, `content/initial-v1.json`, and `admin/src/import/`.

## Tasks
1. **Updating existing content.** The Import page only creates items and skips existing slugs, so it cannot add data to the 18 destinations already published. Compare: manual edits in the admin forms; an opt-in update mode for the Import page that replaces whole destinations through the existing `PUT` API (show a per-item diff in "Check", never touch items absent from the file); or other options. Recommend one, with its risks, and wait for the owner's decision before implementing.
2. **Indicative costs** (ADR-008). For each destination, find published sources (for example national tourism or statistics offices, or other reputable surveys) that support an indicative range per person per day, excluding international flights. Record currency, period, scope, min, max, source name and URL, the date checked, and a basis text in `ja`, `en`, and `es`. Never present a value as a live price, never invent or extrapolate a number without a source, and leave a destination without an estimate when no adequate source exists. Decide with the owner whether to provide `JPY` only or also `USD` and `EUR`, given that budgets are compared only in the same currency ("Open questions" item 6).
3. **Best months and season text.** Add `bestMonths` and `bestSeason` only where a cited source supports them; otherwise leave them empty. Keep the sources in the review material even though the data model has no source field for months.
4. **Images (optional; owner decision first).** Images are loaded directly from their host, which then sees the visitor's IP address (`docs/en/ARCHITECTURE.md` section 8). Present the privacy and license trade-offs (self-hosting with clear licenses versus external hosts) before choosing any. Every image needs an `https` URL, attribution, and alt text in all three locales.
5. **Review and import.** Put the enriched content in a new bundle in `content/` with tests passing (`test/node/content-bundle.test.ts`), and give the owner a rendered review copy (all three locales, every source linked) before any import. Import on preview first, then production, with Time Travel bookmarks before and after (`docs/en/OPERATIONS.md` section 8).
6. **Full quizzes in English and Spanish.** On preview and on production, answer the quiz from the start in `en` and in `es` (Phase 7 only switched the language on the results page), and check cost, season, and duration notes in all three locales.
7. **Billing safeguards.**
   - Add a monthly check to `docs/en/OPERATIONS.md` section 3: Manage Account → Billing lists only the domain registration and no other subscription, and the Workers plan is still Free.
   - Before 2026-12-01, re-read https://developers.cloudflare.com/observability/pricing/ and the Workers Logs page. The owner reads the daily log volume in the dashboard; compare it with the Free allowance of 0.5 GB per day and update `docs/en/OPERATIONS.md` section 7 and `docs/en/DEPLOYMENT.md` section 9 with the date checked.
   - List in `docs/en/OPERATIONS.md` the dashboard actions that would start charges (for example upgrading to Workers Paid, or enabling R2, Images, or Logpush) so that they are never taken without a decision.

## Acceptance
- The update path for existing content is decided and, if implemented, covered by unit and E2E tests.
- Every cost estimate, best-month entry, and image in the new bundle has a cited source or license; items without one are left empty, not guessed.
- The owner approved the rendered review copy, and the content is imported on preview and production with bookmarks recorded.
- Full quizzes in `en` and `es` pass on both environments.
- `docs/en/OPERATIONS.md` contains the monthly billing check and the list of charge-starting actions, and the Workers Logs pricing was re-checked before 2026-12-01 with the date recorded.
- `npm run check` and `npm run test:e2e` pass; AI stays disabled; the account stays on Workers Free.
