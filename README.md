# Travel Discovery

Travel Discovery is a responsive web app that recommends overseas city/region-level destinations from a short, varied quiz and optional trip constraints (length, months, budget). It explains why each destination fits, shows indicative cost ranges with their source and date, and links to flight and hotel searches. The UI supports Japanese, English, and Spanish; Japanese is the default.

Status: Phases 0–6 are complete. Preview and production are deployed on `workers.dev` with AI disabled (`docs/DEPLOYMENT.md`); Phase 7 (post-launch operations) is in progress. See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## How it works

- **Deterministic diagnosis.** Question selection, scoring, and ranking are plain TypeScript in `domain/diagnosis/` ([`docs/DIAGNOSTIC_ALGORITHM.md`](docs/DIAGNOSTIC_ALGORITHM.md)). They run in the browser on a content snapshot; answers stay in memory and are never stored (ADR-022 in [`docs/DECISIONS.md`](docs/DECISIONS.md)).
- **Optional AI notes.** A visible toggle, off by default. When on, the server recomputes the ranking and asks Workers AI (`@cf/google/gemma-4-26b-a4b-it`) for a short note per destination; AI never selects, orders, or scores destinations, and any failure leaves the normal results in place (ADR-026). AI is disabled until it is configured for a deployment.
- **Indicative costs.** Ranges with basis, source, and update date, never live prices (ADR-008, ADR-021).
- **Two Cloudflare Workers, one D1 database.** A public Worker (SPA + read-only API + the AI endpoint) and a separate admin Worker (admin SPA + API) protected by Cloudflare Access with JWT validation in every admin API handler ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), ADR-004, ADR-018).

## Local setup

Requirements: Node.js `>=22.22.0` (`.nvmrc` pins 24) and npm. No Cloudflare account, login, or secret is needed.

```bash
npm ci
npm run db:reset:local
npm run dev
```

Open http://localhost:5173. `npm run db:reset:local` deletes any existing local D1 data, then applies migrations and loads `db/seed/dev.sql`.

Admin console locally (Cloudflare Access does not run locally, so a local identity is used in the dev server only):

```bash
cp .dev.vars.example .dev.vars
npm run dev:admin
```

Open http://localhost:5174. Details, all commands, and the project layout: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Testing

| Command | What it runs |
|---|---|
| `npm run check` | Lint, type-check, unit and Workers-runtime tests (Vitest), production build with bundle checks. Also run by CI. |
| `npm run test:e2e` | Playwright end-to-end tests for the public and admin apps against production builds and an admin dev server, using the installed Google Chrome. |
| `npm run ai:eval` | Opt-in comparison of Workers AI models. Calls real models and consumes Neurons; needs explicit confirmation and an API token ([`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md)). Never part of `check`. |

CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci` and `npm run check` on pushes and pull requests (ADR-027).

## Configuration

- Local variables live in the git-ignored `.dev.vars`; `.env.example` lists every variable with placeholders only.
- Deployed values are set with `wrangler secret put` or the Cloudflare dashboard, never in files. AI and rate-limit bindings exist only in named deployment environments, never in the configuration used for local development and tests.
- Deployment is not set up yet. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) is the runbook: preview and production environments, D1 creation and migrations, Cloudflare Access for the admin Worker, build and deploy commands, rollback, and free-tier assumptions. Do not deploy without the owner's approval.

## Repository layout

```text
src/            Public SPA (React)           admin/          Admin SPA (React)
worker/         Public Worker                admin-worker/   Admin Worker
domain/         Deterministic diagnosis      server/         Worker-side code (db, http, public, admin, ai)
shared/         Browser + Worker contracts   migrations/     D1 migrations
db/seed/        Local seed data              e2e/            Playwright specs
test/           Workers, Node, and AI-evaluation tests
scripts/        Build checks and helpers     docs/           Specification, architecture, decisions, guides
prompts/        Per-phase prompts for Claude Code
```

## Documentation

| Document | Contents |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Product specification |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Workers, layers, request flows, privacy |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Data model |
| [`docs/DIAGNOSTIC_ALGORITHM.md`](docs/DIAGNOSTIC_ALGORITHM.md) | Scoring and ranking specification |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture decisions and verification logs |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local development, tests, E2E, CI |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deployment runbook and pre-deployment checklist |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Monitoring, routine checks, and incident response for the deployed app |
| [`docs/PUBLIC_RELEASE.md`](docs/PUBLIC_RELEASE.md) | Checklist before making the repository public |
| [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md) | Workers AI model evaluation |

## Working with Claude Code

`CLAUDE.md` holds the project instructions. Work proceeds one phase at a time with the prompts in `prompts/`; a phase starts only after the previous phase's acceptance criteria pass.

## Language policy

- Conversations with the owner: Japanese.
- Repository documentation, source comments, and docstrings: English.
- App UI: Japanese, English, and Spanish (`ja`, `en`, `es`), Japanese by default.

## Principles

- The diagnosis is deterministic and works without AI; AI is optional, user-controlled, off by default, and never ranks.
- Destinations are cities or regions, each linked to a country.
- Costs are indicative ranges with source, basis, and date, never live prices.
- No user accounts and no server-side storage of answers or diagnosis history.
- Secrets stay out of the repository and browser bundles; admin pages and APIs are protected on the server.
- Free tiers, models, prices, and limits change; verify current official documentation before relying on them.

## License

No license has been chosen yet; the owner decides before any public release ([`docs/PUBLIC_RELEASE.md`](docs/PUBLIC_RELEASE.md)).
