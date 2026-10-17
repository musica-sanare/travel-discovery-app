# Prompt 03 — Public quiz/results experience

Read the spec and domain algorithm docs. Implement the public-facing experience on top of the existing API and tested domain behavior.

## Localization
- Support Japanese (`ja`), English (`en`), and Spanish (`es`) throughout public and admin UI.
- Default locale is Japanese; provide a visible, keyboard-accessible language switcher.
- Keep UI strings in locale resources with stable typed keys, not hard-coded in components.
- Localize validation, loading, empty/error states and seeded content; update document language metadata.
- Use locale-aware number/date/currency formatting and a documented fallback for missing content.

## Pages
- Landing page.
- Trip constraints form.
- Quiz page with question, options, progress, back/edit/restart.
- Results page with 3–5 city/region recommendations.
- Destination detail view or expandable detail section.

## UX requirements
- Modern, polished, responsive design with restrained Motion animations.
- Japanese UI for MVP.
- Accessible labels, keyboard operation, visible focus, semantic HTML, reduced-motion support.
- Handle loading, empty, invalid, network-error, and retry states.
- Make question transitions lively but never delay interaction.
- AI-assistance toggle is visible and defaults OFF.
- When toggle is OFF, do not call any AI endpoint.
- Results must work with AI disabled.
- Show relative-fit explanation, destination highlights/cautions, suggested duration/season, indicative cost scope/source/update date, and external search links.
- Clearly label costs as estimates, not live prices.
- Validate and safely encode outbound search parameters; use verified URL patterns only.
- Do not fabricate prices, visa rules, flight schedules, hotel availability, or other current facts.

## Tests
- Unit tests for UI helpers as appropriate.
- Playwright E2E for landing → constraints → quiz → results, back/edit/restart, and AI toggle OFF.
- Test at mobile and desktop viewport sizes.
- Include an error/empty-data path.

## Acceptance
The complete core journey works without AI. Lint, type-check, tests, and production build pass. Summarize changed files and remaining UX issues. Do not add AI chat yet.
