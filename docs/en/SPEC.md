English | [日本語](../ja/SPEC.md) · [Docs index](README.md)

# Product Specification — Travel Discovery

- Version: 0.1
- Status: Initial implementation baseline
- Product type: Personal project / public web app
- Application languages: Japanese (`ja`), English (`en`), and Spanish (`es`) from MVP. Default locale: Japanese.

## 1. Product goal

Help a user discover suitable overseas destinations through a short, varied quiz. Recommend 3–5 city/region-level destinations, explain why they fit, show indicative cost information, and provide links to flight/hotel searches.

The experience should be visually polished and interactive while remaining understandable, testable, inexpensive to operate, and suitable for eventual public source-code release.

## 2. Target users and primary journey

1. Open the landing page.
2. Optionally set trip constraints: departure city/airport, approximate travel period, trip length, budget range, and other relevant constraints.
3. Choose whether to use AI assistance. This toggle is visible in the UI and defaults to OFF.
4. Answer a dynamically selected set of questions, normally around 10.
5. See 3–5 ranked destinations with fit score, rationale, highlights, cautions, suggested duration/season, indicative budget, and search links.
6. Optionally use AI to rephrase/explain recommendations or ask a limited follow-up question in a later phase.

No account is required. Do not persist individual answers or diagnosis history on the server in the MVP.

## 3. Scope

### MVP / P0
- Responsive public UI localized in Japanese, English, and Spanish, with a visible language switcher.
- Question-based diagnosis with random variation and adaptive selection.
- Core scoring and ranking implemented in deterministic TypeScript, independent of AI.
- Destination results for city/region-level destinations associated with countries.
- D1-backed content data and migrations.
- Passwordless/managed admin access via a suitable Cloudflare access-control approach, after verifying current official documentation.
- Admin CRUD for questions, options, score effects, destinations, destination attributes, and global settings.
- User-visible AI-assistance toggle; default OFF.
- AI-assisted recommendation explanation when enabled and available.
- Deterministic fallback explanation when AI is disabled, unavailable, rate-limited, or fails validation.
- External flight and hotel search links. No live price integration.
- Unit tests for scoring/question selection and API validation; E2E tests for main flow and admin authorization.
- README, architecture/data model docs, `.env.example`, CI checks, and deployment instructions.

### Out of scope for MVP
- User accounts or profiles.
- Server-side storage of personal quiz answers or history.
- Real-time flight/hotel prices or booking.
- Payment, affiliate tracking, or monetization.
- AI-controlled destination ranking.
- AI-generated facts presented without validation.
- Native mobile app.
- Public registration or multi-admin role management.

## 4. Quiz behavior

- Target count: 10 questions.
- Proposed configurable bounds: minimum 6, maximum 12. These are initial defaults, editable by admin.
- Questions are drawn from active/published questions only.
- Avoid repeating a question in one session.
- Vary the combination between sessions.
- Balance question categories and prioritize questions that distinguish currently plausible destinations or fill gaps in preference signals.
- Adapt the next question based on prior answers.
- Stop once minimum count is met and a documented stopping rule says enough useful signal exists; always stop at maximum.
- User can go back, edit an answer, restart, and see progress.
- If insufficient active questions exist, gracefully ask fewer questions and show a clear message; never crash.
- Use a seeded/randomization strategy that can be tested. Do not make tests depend on uncontrolled randomness.

### Initial question types
- Single choice.
- Multiple choice only if scoring semantics are clearly defined.
- Numeric/range slider only for a clearly bounded value such as budget.
- Free-text answers are not part of the core quiz in MVP; later AI chat must be a separate, optional capability.

## 5. Trip constraints

Keep hard constraints distinct from preference scores:
- Departure location/airport (optional but useful for search links).
- Approximate trip duration.
- Travel period or season, if supplied.
- Budget range and currency, if supplied.
- Other constraints should only be added when there is a clear product need.

Do not treat a missing value as zero. Explain when a recommendation is based on incomplete cost/season information.

## 6. Scoring and recommendations

- Each destination has attribute scores on a documented scale (initial proposal: 0–5).
- Answer options apply weighted effects to one or more attributes.
- Keep score calculation as a pure function with unit tests.
- Apply hard filters only for explicitly supplied hard constraints; otherwise use soft fit scoring.
- Normalize scores to a documented comparable range before displaying them.
- Return 3–5 destinations where data permits; if fewer eligible destinations exist, return fewer with an explanation.
- Tie-breaking must be deterministic given the same answers and destination data.
- Clearly label scores as relative fit based on current content data, not objective probability or guarantee.
- AI may explain already-selected destinations but must not change order, scores, eligibility, or facts.
- Include a human-authored fallback explanation for every destination.

## 7. Destination content

Destination is a city or region, linked to a country. Each destination should support:
- Stable ID / slug.
- Display name and country reference.
- Summary and highlights.
- Travel style / attribute scores.
- Recommended trip duration.
- Best-season guidance.
- Cautions / limitations.
- Indicative cost range with currency, scope, basis, source, and last-updated date.
- Image URL, image attribution/source, and alt text.
- Search-link configuration or a safe link-generation strategy.
- Publication status and timestamps.

Do not invent current travel prices. Seed data may contain clearly labelled illustrative estimates only when the source/basis/date are recorded. Prefer manually maintained ranges at first.

## 8. AI assistance

- The user explicitly chooses AI assistance in the UI; default OFF.
- When OFF, do not make AI requests.
- When ON, the deterministic quiz and ranking run first.
- AI receives only the minimum data needed: destination content and a concise summary of relevant answers.
- AI generates explanation text only in MVP; no destination selection/ranking.
- Validate the response schema and apply length limits.
- Treat all user input and destination text as untrusted data, not instructions.
- Do not expose secrets, system prompts, internal stack traces, or provider errors.
- Apply server-side request limits and graceful error handling.
- If AI is unavailable, over quota, or returns invalid output, display the deterministic fallback and a non-blocking notice.
- Verify the current Cloudflare Workers AI free allowance, supported models, terms, and compatibility during implementation. Never promise that the service will remain free.

## 9. Flight/hotel search links

- Provide outbound links to flight and hotel search providers.
- Use only documented, stable URL parameters or official partner/deep-link formats verified during implementation.
- If search parameters cannot safely be encoded, link to the provider's search page without pretending the search is prefilled.
- Do not scrape search sites.
- No booking, price guarantees, affiliate IDs, or live availability claims in MVP.
- Open external links safely (`rel`/target behavior as appropriate) and make clear users are leaving the app.

## 10. Admin console

Admin can:
- List/search/filter questions and destinations.
- Create/edit/deactivate questions.
- Manage question options and weighted attribute effects.
- Create/edit/deactivate destinations and attribute scores.
- Update indicative cost metadata and source/update dates.
- Preview changes before publication where practical.
- Change quiz min/max counts and result count within validated bounds.

Admin requirements:
- Protect UI routes and every admin API endpoint.
- Validate input server-side.
- Do not rely on client-side hiding or obscurity.
- Use soft-delete/deactivation for content referenced by other records.
- Display validation errors in a useful way.
- Record non-sensitive admin operation metadata only if needed; do not log secrets or full quiz answers.

## 11. Internationalization and localization

- Support Japanese (`ja`), English (`en`), and Spanish (`es`) in the MVP.
- Default to Japanese on first visit. If locale persistence is implemented, store only the user's UI preference locally; do not require an account or send it to the server unnecessarily.
- Provide a visible, keyboard-accessible language selector.
- Localize public and admin UI labels, buttons, navigation, form validation, loading/error/empty states, quiz questions/options, destination names/descriptions/highlights/cautions, cost labels, and AI explanation instructions/output.
- Use locale files and stable translation keys; do not scatter hard-coded UI strings through components.
- Use locale-aware number/date/currency formatting.
- Store stable IDs and slugs independently from translated labels.
- Do not rely on runtime machine translation for core content. Curate translations for seeded content.
- If content is missing in the selected language, follow one documented fallback policy and make it clear where necessary.
- Use appropriate document language metadata and ensure language switching updates it.

## 12. Accessibility and UX

- Mobile-first responsive layout.
- Keyboard navigation and visible focus.
- Semantic form controls and accessible labels.
- Respect reduced-motion preferences.
- Provide loading, empty, error, and retry states.
- Avoid animation that blocks or delays user input.
- Keep the main diagnosis usable when motion or AI is disabled.
- Do not use color alone to communicate status.

## 13. Privacy and security

- No account system or server-side quiz-history storage in MVP.
- Do not send answers to AI unless the user has enabled AI assistance.
- Do not store secrets in the repository or browser bundle.
- Validate all API inputs and AI outputs.
- Apply reasonable rate limits to AI and admin endpoints.
- Keep production error messages generic; detailed errors belong in controlled server logs.
- Avoid analytics and third-party trackers by default.
- Document any external image, AI, or search provider and associated data flow.
- Protect admin API authorization independently of frontend routing.

## 14. MVP acceptance criteria

1. User can complete a diagnosis on mobile and desktop in Japanese, English, and Spanish.
2. Questions vary across sessions and do not repeat within one session.
3. Adaptive selection obeys configured min/max bounds.
4. Ranking is deterministic for the same data and answers.
5. Three to five recommendations are shown when enough eligible destinations exist.
6. AI toggle OFF results in zero AI requests.
7. AI failure does not block or alter the recommendations.
8. Admin can edit and publish questions and destinations without code changes.
9. Unauthenticated users cannot perform admin API operations.
10. Migrations and seed data work from a clean local database.
11. Language switching works across public/admin UI and seeded content; missing translations follow the documented fallback policy.
12. Lint, type-check, unit tests, E2E tests, and production build pass.
13. Deployment can be repeated from documented instructions without committing secrets.
