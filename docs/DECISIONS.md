# Architecture Decision Records

Record decisions here as they are verified. Do not claim a decision is verified until the relevant docs or tests have been checked.

## ADR-001: SPA and hosting
- Status: Proposed
- Decision: React + TypeScript + Vite deployed with Cloudflare's supported Workers/Vite integration.
- Rationale: Modern UI, one deployment surface for static assets and API, no separate server to manage.
- Verify: Current official Cloudflare setup, routing, local dev, asset handling, and deployment instructions.

## ADR-002: Database
- Status: Proposed
- Decision: Cloudflare D1.
- Rationale: Relational content data, low operational overhead, fits Cloudflare deployment.
- Verify: Current free limits, local development workflow, migrations, backup/export and production migration process.

## ADR-003: ORM and validation
- Status: Proposed
- Decision: Drizzle ORM + Zod, subject to compatibility check.
- Rationale: Typed schema/migrations and runtime validation at boundaries.
- Verify: Compatibility with current Cloudflare Workers/D1 runtime and supported package versions.

## ADR-004: Admin authorization
- Status: Needs verification before implementation
- Decision: Prefer Cloudflare Access for the single-owner admin console.
- Rationale: Avoid homemade authentication.
- Verify: Plan availability, route/path protection, Worker identity validation, and protection of both admin UI and API. If not reliable, stop and propose alternatives.

## ADR-005: AI provider
- Status: Proposed
- Decision: Cloudflare Workers AI behind an optional provider interface.
- Rationale: Same platform and possible free allowance.
- Verify: Current available models, supported bindings/API, free allowance, data handling, limits, and error behavior.

## ADR-006: AI is optional
- Status: Accepted
- Decision: User-controlled UI toggle, default OFF. AI generates explanations only; it cannot select or rank destinations.
- Rationale: Cost control, transparency, deterministic results, resilient core experience.

## ADR-007: Destination granularity
- Status: Accepted
- Decision: City/region-level destination as the primary entity, linked to a country.
- Rationale: More useful and actionable than country-only recommendations.

## ADR-008: Cost information
- Status: Accepted
- Decision: Indicative ranges, not live prices; store scope, basis, source, currency, and update date.
- Rationale: Useful cost awareness without fragile real-time integrations or misleading precision.

## ADR-009: No user account in MVP
- Status: Accepted
- Decision: No user login and no server-side persistence of individual quiz answers in MVP.
- Rationale: Minimize personal data, attack surface, and maintenance.

## ADR-010: Source repository
- Status: Accepted
- Decision: GitHub Private initially; maintain clean structure, docs, tests, and secret hygiene so public release remains possible.
- Rationale: Preserve the option to open source later.

## ADR-011: Conversation and repository language policy
- Status: Accepted
- Decision: Claude Code conversations with the owner are always in Japanese. Repository documentation, source comments, and docstrings are in English.
- Rationale: Keep collaboration comfortable while making the repository accessible to an international audience.
- Enforcement: State this policy in `CLAUDE.md` and review all generated artifacts.

## ADR-012: Application locales
- Status: Accepted
- Decision: MVP supports Japanese (`ja`), English (`en`), and Spanish (`es`); Japanese is the default.
- Rationale: Make the app useful in multiple languages from the start and avoid expensive retrofitting.
- Enforcement: Use locale resources and stable translation keys; localize seeded question and destination content; add language-switching tests.
- Verify: Select an i18n library compatible with the chosen stack and document the missing-translation fallback policy.
