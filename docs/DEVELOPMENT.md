# Local Development

## Prerequisites
- Node.js `>=22.22.0` (`.nvmrc` pins 24)
- npm (bundled with Node; the committed `package-lock.json` is authoritative)

No Cloudflare account, login, or secrets are needed for local development. Nothing in this guide creates remote resources.

## Setup

```bash
npm ci
npm run db:reset:local
```

`.npmrc` sets:
- `engine-strict=true`: installs fail on an unsupported Node version.
- `strict-allow-scripts=true`: installs fail if any dependency has install scripts not listed in `package.json` `allowScripts`. The scripts of `esbuild`, `fsevents`, and `workerd` are explicitly denied because they are not needed (ADR-016 in `docs/DECISIONS.md`).

If `npm ci` fails with `ESTRICTALLOWSCRIPTS`, a dependency update introduced a new install script. Review what it does, then record a decision with `npm deny-scripts <pkg>` (preferred) or `npm approve-scripts <pkg>` (version-pinned). Never use `--dangerously-allow-all-scripts` or `npm approve-scripts --all`.

Do not install with `--omit=optional`: the `workerd` and `esbuild` binaries come from platform-specific optional dependencies.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Public app: Vite dev server on http://localhost:5173 with the public Worker in the local Workers runtime. |
| `npm run dev:admin` | Admin app: Vite dev server on http://localhost:5174 with the admin Worker. See "Admin locally". |
| `npm run build` | Type-check, build the public app (`dist/`) and admin app (`dist-admin/`), then run `scripts/verify-bundles.mjs`. |
| `npm run preview` / `npm run preview:admin` | Serve a production build locally in the Workers runtime (ports 4173 / 4174). Run `npm run build` first. |
| `npm run lint` | ESLint (type-aware rules and module-boundary rules). |
| `npm run typecheck` | TypeScript project references build, no emit. |
| `npm test` | Vitest: `unit` project (Node/jsdom) and `workers` project (Workers runtime with a migrated local D1). |
| `npm run check` | Lint, type-check, tests, and build in sequence. |
| `npm run test:e2e` | Playwright end-to-end tests against a production build (see "End-to-end tests"). Not part of `check`. |
| `npm run ai:eval` | Opt-in model evaluation against real Workers AI models; consumes Neurons and needs explicit confirmation and credentials (docs/AI_EVALUATION.md). Never part of `check`. |
| `npm run e2e:db` | Recreate the isolated E2E database in `.wrangler/e2e/state` (migrate and seed). Run automatically by `test:e2e`. |
| `npm run db:generate` | Generate a SQL migration from `server/db/schema.ts` into `migrations/` (drizzle-kit). Review the SQL before applying. |
| `npm run db:migrate:local` | Apply pending migrations to the local D1 database. |
| `npm run db:seed:local` | Load `db/seed/dev.sql` into the local database (expects an empty, migrated database). |
| `npm run db:reset:local` | Delete local D1 state, then migrate and seed. |

There is intentionally no deploy script and no remote database command. Do not run `wrangler deploy` or any `--remote` command without the owner's approval. `scripts/check-deployment.mjs` only sends anonymous requests to the deployed Workers (`docs/OPERATIONS.md` "3. Routine checks").

## Project layout

```text
index.html, src/        Public SPA (React)
admin/                  Admin SPA (index.html, src/, public/_headers)
worker/                 Public Worker: read-only API under /api/*
admin-worker/           Admin Worker: admin API under /api/admin/*
server/db/              Drizzle schema and client (shared)
server/http/            Error contract and request parsing (shared)
server/public/          Published-content reads and the AI explanation use case (public Worker only)
server/ai/              AI provider interface and model-output validation (public Worker only)
server/admin/           Admin validation, reads, writes, Access auth (admin only)
shared/                 Locale, currency, month, and API error constants (browser and Workers)
domain/diagnosis/       Pure diagnostic engine (docs/DIAGNOSTIC_ALGORITHM.md)
migrations/             Generated SQL migrations (+ drizzle-kit snapshots in meta/)
db/seed/dev.sql         Local seed data
test/workers/           Workers-runtime tests (D1, auth, CRUD, public API)
test/node/              Static boundary checks
scripts/                Build-time verification
wrangler.jsonc          Public Worker config (binding PUBLIC_DB)
wrangler.admin.jsonc    Admin Worker config (binding ADMIN_DB; owns migrations)
```

ESLint (`no-restricted-imports`) and `test/node/boundary.test.ts` keep admin code out of the public Worker and SPA (ADR-018). The same mechanisms keep `domain/` free of UI, server, database, platform, and AI dependencies (ADR-021).

## Database

Both Workers bind the same D1 database (`travel-discovery`). For local development both configs use the placeholder `database_id` `local-travel-discovery` so they share one local database under `.wrangler/state` (git-ignored). Migrations are applied only through `wrangler.admin.jsonc`.

Schema changes:
1. Edit `server/db/schema.ts`.
2. `npm run db:generate -- --name <short_name>` and review the generated SQL.
3. `npm run db:migrate:local`, then update `db/seed/dev.sql` if needed.
4. Commit the schema, the SQL file, and `migrations/meta/`.

## Admin locally

Cloudflare Access does not run locally, so the admin API returns 403 by default. To use the admin UI locally:

```bash
cp .dev.vars.example .dev.vars
npm run dev:admin
```

`.dev.vars` (git-ignored) sets `ADMIN_DEV_IDENTITY_EMAIL`. It only works in the Vite dev server: production builds do not contain the code that reads it (checked by `npm run build`). Run `npm run dev` at the same time to see published changes in the public API.

### `.dev.vars` and build output

Verified in this repository (2026-10-17, `@cloudflare/vite-plugin` 1.64.0):
- When a `.dev.vars` file exists, `npm run build` copies it to `dist/worker/.dev.vars` and `dist-admin/admin_worker/.dev.vars`.
- A production build served with `npm run preview:admin` still returns 403 for admin API requests even with that copy present, because the dev identity code is not in the build.

Documented by Cloudflare, not verified here (no deployment has been made): the copy is "only used when running `vite preview` and is not deployed with your Worker" ([Vite plugin: Secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)).

Recommendations:
- Never share, upload, or publish `dist/` or `dist-admin/` (for example as CI artifacts, in archives, or on a static host) while a `.dev.vars` file exists; delete the copied `.dev.vars` files or rebuild without `.dev.vars` first.
- Keep only local, non-sensitive test values in `.dev.vars`; real secrets for deployed Workers are set with `wrangler secret put` or the dashboard.
- Re-check the copy behavior after upgrading `@cloudflare/vite-plugin`.

## Routing between assets and the Worker
Each Worker's config sets `assets.run_worker_first: ["/api/*"]`. Only `/api/*` requests invoke the Worker; other paths are served from static assets, and unknown paths fall back to `index.html` (`not_found_handling: "single-page-application"`).

```bash
curl "http://localhost:5173/api/destinations?locale=en"
```

## Adding UI text
1. Add the key and Japanese text to `src/i18n/messages/ja.ts` (public) or `admin/src/i18n/messages/ja.ts` (admin).
2. Add the same key to `en.ts` and `es.ts`. The type checker fails until all three match.
3. Use `t("your.key")` from `useTranslation()`; never hard-code UI strings in components.

## Accessibility checks

`src/app/accessibility.test.tsx` runs axe-core (dev dependency) on every public page state in ja/en/es, including validation errors, the error state, and expanded result details. jsdom cannot compute colors, so `color-contrast` is disabled there; check contrast in a real browser (light and dark color schemes) when changing colors. Keyboard behavior and screen-reader output still need manual checks.

## End-to-end tests

`npm run test:e2e` runs the specs in `e2e/` with Playwright (`playwright.config.ts`): the public specs in a desktop and a mobile (Pixel 7) project, then `e2e/admin.spec.ts` in an `admin` project (desktop) that runs after them, because it publishes and archives content in the shared database. Playwright starts three servers, all with `E2E_STATE_DIR=.wrangler/e2e/state`, so development data in `.wrangler/state` is never touched:

| Port | Server | Purpose |
|---|---|---|
| 4180 | Public production build (`vite preview`), after recreating the database (`npm run e2e:db`) | Public specs; security headers from `public/_headers` apply |
| 4181 | Admin dev server with `CLOUDFLARE_ENV=e2e` | Allowed admin paths, using the local identity `e2e-admin@example.test` from `env.e2e` in `wrangler.admin.jsonc` (dev builds only; never deploy that environment) |
| 4182 | Admin production build (`vite preview`) | Denied admin paths: without an Access JWT every admin API request must be 403 |

The admin servers wait for the public server (`scripts/wait-for-url.mjs`) so that the database is recreated before they open it, and run without a debugger port so they can start together.

Browsers: by default the tests use the locally installed Google Chrome (`channel: "chrome"`), so nothing is downloaded. To use Playwright's bundled Chromium instead (for example in CI), run `npx playwright install chromium` (downloads a few hundred MB from Microsoft's CDN; get the owner's approval first) and set `PLAYWRIGHT_CHANNEL=bundled`.

The admin spec covers authorization on the production build (403 for every request without a token, also with only a cookie, and the localized error in the UI), the content workflow on the dev server (draft → published → archived, checked through the public API and the diagnosis snapshot, plus a rejected invalid slug), admin language switching with document metadata and the stored choice after a reload, and axe-core on every admin page. The public specs cover the core journey without AI, optional AI notes (off: no request; on: one request to the real preview server, which has no AI configured and answers 503, and a mocked success; no model is ever called), back/edit/restart, reload behavior and storage, language detection and switching, API errors and empty content, security headers and CSP errors, horizontal overflow, a keyboard-only run (desktop), and axe-core checks in light and dark mode. The axe test disables CSP for its own context only, because axe is injected as an inline script.

## Continuous integration

`.github/workflows/ci.yml` runs two jobs on pushes to `main` and `dev` and on pull requests (docs/DECISIONS.md ADR-027): `check` (`npm ci`, `npm run check`) and `e2e` (`npm ci`, `npm run test:e2e` with the Google Chrome preinstalled on the runner image, so nothing is downloaded). Failed E2E runs upload `test-results/` (traces with local seed data only) as an artifact kept for 7 days. Neither job needs secrets. A full local E2E run took about 1 minute on 2026-10-24.

## Environment variables
- Local: `.dev.vars` (see "Admin locally"). `.env.example` lists all variables.
- Deployed admin Worker (set only after the owner approves the Access setup): `ACCESS_TEAM_DOMAIN`, `ACCESS_POLICY_AUD`. Without them every admin API request is rejected with 403. Optional Rate Limiting binding `ADMIN_RATE_LIMITER` (keyed by the Access email; not configured yet, docs/DECISIONS.md ADR-020).
- Public Worker, AI explanations (docs/DECISIONS.md ADR-026; none is configured yet): `AI_ASSIST_ENABLED` (`"true"` enables the endpoint; anything else, including unset, disables it and no model is called), `AI_MODEL` (one of the model IDs in `server/ai/workers-ai.ts`), the `AI` binding, and the optional per-client rate-limit binding `AI_CLIENT_RATE_LIMITER` (there is deliberately no global limiter, ADR-026). To disable AI, set `AI_ASSIST_ENABLED` to anything other than `"true"` or remove it; the diagnosis keeps working. Tests use fakes and never call Workers AI. These settings belong only in a named deployment environment, never in the top-level `wrangler.jsonc` used by `npm run dev`, tests, and E2E, because an `ai` binding always connects to Cloudflare (docs/DECISIONS.md ADR-026, C). Real-model runs use only the opt-in evaluation procedure in `docs/AI_EVALUATION.md`; never put a Cloudflare API token in `.dev.vars`, because the build copies that file into `dist/`.
