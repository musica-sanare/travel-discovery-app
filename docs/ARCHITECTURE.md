# Architecture — Travel Discovery

## 1. Proposed architecture

Use a TypeScript SPA built with React and Vite, deployed with Cloudflare's supported Vite/Workers integration. Serve static assets and API routes from the same application deployment where practical.

Proposed components:
- React + TypeScript + Vite.
- React Router for public/admin route organization.
- A maintained i18n solution compatible with the selected stack (verify current options) for `ja`, `en`, and `es` localization.
- Tailwind CSS and shadcn/ui for UI.
- Motion for React for restrained transitions.
- Cloudflare Workers for API endpoints and server-side logic.
- Cloudflare D1 for content data.
- Drizzle ORM and migrations, if current compatibility is confirmed.
- Zod for runtime input/output validation.
- Workers AI as an optional provider behind a small adapter interface.
- Vitest for unit/integration tests; Playwright for E2E.
- GitHub Actions for lint, type-check, tests, and build.

Do not assume versions or compatibility from memory. Check current official docs before scaffolding and record decisions in `docs/DECISIONS.md`.

## 2. Logical layers

### UI
- Public landing page.
- Quiz flow.
- Results page.
- Admin console, localized in Japanese, English, and Spanish.
- AI assistance toggle and non-blocking availability/error messages.

### Domain logic (pure TypeScript)
- Question candidate selection.
- Adaptive next-question selection.
- Answer validation.
- Destination hard filtering and preference scoring.
- Ranking, normalization, and deterministic tie-breaking.
- Fallback explanation generation.

Domain logic must not import React, Cloudflare bindings, database clients, or AI SDKs. It should be testable without network or database access.

### Application/services
- Read active questions and destinations.
- Apply quiz and recommendation use cases.
- Handle AI explanation request only when explicitly enabled.
- Validate all external inputs and model outputs.

### Data access
- D1 repository/query layer.
- Drizzle schema/migrations if selected.
- Seed scripts/data.
- Never expose direct DB access to the browser.

### Infrastructure
- Worker routes and middleware.
- Admin access control.
- AI provider adapter.
- Rate limiting and safe error handling.
- Deployment configuration.

## 3. Request flow

### Diagnosis
1. Client loads active quiz configuration and content through public API.
2. Client manages answers in memory for the session.
3. Client or server invokes deterministic scoring; choose one canonical location during implementation and document why. Recommended: perform authoritative scoring in the Worker using submitted answer IDs and server-loaded content, so clients cannot tamper with destination scores.
4. Worker returns ranked destination IDs and safe result data.
5. If AI assistance is enabled, client makes a separate explicit request for explanation generation. Worker revalidates the request and generates explanation text for the already-ranked results.
6. If AI fails, client uses the deterministic fallback included in normal result data.

Do not persist individual answer histories in D1.

### Admin
1. Admin enters protected admin route.
2. Access control is enforced at the edge and/or by a verified server-side identity check.
3. Admin API validates authorization independently for every mutation and sensitive read.
4. API validates payloads and writes to D1.
5. Changes become visible to public endpoints only after successful validation/publication.

## 4. Admin authentication

Preferred low-complexity approach: Cloudflare Access protecting admin UI and admin API, if the current plan and deployment model support the intended setup.

Before implementing:
- Verify official docs for protecting the application and API paths.
- Verify how the Worker receives and validates identity claims.
- Do not assume that protecting only `/admin/*` UI routes protects `/api/admin/*`.
- If Access cannot be applied reliably to all required endpoints, stop and propose a secure alternative before implementing.
- Do not create a homemade password system as a shortcut.

## 5. AI provider boundary

Create a small interface, e.g. `RecommendationExplanationProvider`, with a method that accepts validated destination content and a compact preference summary and returns validated explanation data.

The domain scoring engine must not depend on this interface. The Workers AI adapter is optional and replaceable. Include:
- input length limits,
- output schema validation,
- timeout/error handling appropriate to the platform,
- request budget/rate limit,
- safe fallback,
- no raw secrets or unnecessary personal data in prompts/logs.

Do not treat destination descriptions or user input as trusted instructions. Keep the prompt explicit that the model is an editor/explainer, not a ranking engine or factual source.

## 6. Data and API principles

- Use stable IDs/slugs, foreign keys, constraints, and indexes where appropriate.
- Separate public read endpoints from admin mutation endpoints.
- Return only fields needed by the public UI.
- Never expose admin metadata or private bindings through public endpoints.
- Use schema validation at API boundaries.
- Use migrations and reproducible seed data.
- Avoid unbounded list endpoints; paginate admin lists if needed.
- Use generic client errors and controlled server logs.

## 7. Internationalization

- Keep locale dictionaries/resources separate from UI components and domain logic.
- Use stable typed translation keys and a consistent fallback policy.
- Keep content translations separate from stable entity IDs/slugs; use localized columns or normalized translation tables based on the final schema decision.
- The selected locale must be available to public and admin UI, and language changes must update document language metadata.
- Format dates, numbers, and currencies using locale-aware platform APIs.
- Do not send locale preference to third parties unless necessary and documented.

## 8. Observability and privacy

MVP does not require analytics. Log only operational errors and coarse AI usage/failure counters if useful. Do not log complete answers or sensitive user text. Document log retention and provider data flow.

## 9. Deployment

- Local development should work with local D1 bindings and seeded test data.
- Preview and production environments must be distinct.
- Production secrets must be set through the platform secret mechanism.
- Keep `.dev.vars` and `.env` out of Git.
- Include `.env.example` with placeholders only.
- Document database creation, migrations, seed process, Access setup, and deployment.
- Do not deploy or create billable resources without explicit user approval.
