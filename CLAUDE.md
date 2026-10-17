# Project instructions for Claude Code

## Product
Build **Travel Discovery**, a modern, responsive web app that recommends overseas destinations based on a user's travel preferences and constraints.

## Language policy (mandatory)
- All communication with the project owner in Claude Code conversations must be in Japanese, including questions, progress updates, explanations, test summaries, and handoff notes.
- All repository documentation and prose intended to live in the repository must be written in English, including Markdown docs, README, architecture notes, ADRs, setup instructions, and user-facing source comments.
- Source-code comments and docstrings must be in English. Prefer clear naming over comments; do not add redundant comments.
- The application UI must support Japanese, English, and Spanish from the MVP. Users must be able to switch language in the UI.
- Keep UI strings out of components and domain logic. Use a consistent localization/i18n approach with typed translation keys and locale files.
- Store locale-neutral stable IDs/slugs in data. Localize user-visible question text, option labels, destination names/descriptions, validation messages, and admin UI labels.
- Default locale: Japanese. Supported locale codes: `ja`, `en`, `es`.
- Format numbers, dates, and currencies according to the selected locale where applicable.
- Do not machine-translate arbitrary content at runtime as a substitute for curated translations. If a translation is unavailable, use a documented fallback strategy.
- Discuss the work with the owner in Japanese even when repository artifacts are written in English.

## Read first
Before changing code, read:
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DECISIONS.md`

If any path does not exist, report it rather than silently inventing its contents.

## Non-negotiable principles
1. The core diagnostic and destination ranking must work without generative AI.
2. AI assistance is optional and user-controlled in the UI. Default OFF.
3. AI must never change destination ranking or fabricate factual travel prices, opening hours, visa requirements, or other live facts.
4. Destination recommendations are city/region-level, associated with a country.
5. Costs are indicative ranges with a reference basis, source, and last-updated date. Never call them live prices.
6. No user account or server-side diagnosis history in the MVP.
7. Keep all secrets out of source control and browser bundles.
8. Protect all admin pages **and admin API endpoints**. Hiding a UI route is not authorization.
9. Validate all API inputs and AI outputs at runtime.
10. Prefer the smallest understandable implementation over unnecessary abstractions.

## Engineering rules
- Use TypeScript strict mode.
- Use the package manager and lockfile selected during foundation setup; do not switch later without approval.
- Keep UI, business logic, data access, and AI integration separated.
- Use database migrations for schema changes; never rely on manual production DB edits.
- Add or update tests for behavior changes.
- Run lint, type-check, tests, and production build after meaningful changes.
- Do not claim a command passed unless it was actually run and its result was checked.
- Do not silently suppress TypeScript errors, lint rules, or failing tests.
- Avoid `any`; if it is necessary, document why.
- Handle loading, empty, validation-error, network-error, and AI-unavailable states.
- Use semantic HTML, keyboard-accessible controls, visible focus, and responsive layouts.
- Do not add analytics, trackers, cookies, or external services without documenting the purpose and privacy impact.

## Dependencies and current documentation
Before choosing framework/plugin versions or Cloudflare/AI capabilities, verify current official documentation and compatibility. Prefer stable releases. Record important choices and rationale in `docs/DECISIONS.md`. Do not assume a free tier or model availability without checking current terms.

## Workflow
- Work one phase at a time using the prompt files under `prompts/`.
- Start each phase by stating the intended changes and files affected.
- Inspect existing files before editing.
- After implementation, run relevant checks and summarize:
  - changed files
  - decisions made
  - commands/tests run and results
  - known limitations / `要確認`
  - next recommended phase
- Do not proceed to the next phase until the current phase's acceptance criteria pass.
- If an architectural decision would materially change cost, security, deployment, or data model, stop and ask before proceeding.

## Git hygiene
- Repository is initially private.
- Never commit secrets, `.env` files, personal data, real API tokens, or generated credentials.
- Include `.env.example` with placeholders only.
- Use focused commits with clear messages if asked to commit. Do not rewrite or delete history unless explicitly instructed.
- Before any public release, inspect the complete repository history and scan for secrets.
