# Prompt 05 — Quality, accessibility, and end-to-end coverage

Review the complete app against `docs/en/SPEC.md`, not just the happy path.

## Tasks
- Test switching between Japanese, English, and Spanish across public and admin pages.
- Check missing-translation fallback and document language metadata.
- Verify all repository docs, source comments, and docstrings are in English; all owner-facing summaries remain in Japanese.
- Run lint, type-check, unit tests, E2E tests, and production build.
- Add missing E2E coverage for admin authorization, content CRUD, publication filtering, quiz completion, AI OFF, and AI failure fallback.
- Check keyboard navigation, focus visibility, form labels, semantic structure, reduced-motion preferences, contrast, and responsive layouts.
- Review loading, empty, error, and retry states.
- Review API validation, error leakage, rate limits, and public/admin separation.
- Check outbound links and ensure no unsupported URL parameters or fabricated live-price claims.
- Check that no API key, `.env`, credentials, or personal data is in tracked files or history accessible in the repository.
- Keep the UI design coherent and avoid adding unnecessary dependencies.
- Fix root causes rather than suppressing warnings or weakening tests.

## Acceptance
All automated checks pass or any remaining failure is explicitly documented with reason and risk. Provide a checklist of manual checks the owner should perform before deployment. Do not deploy.
