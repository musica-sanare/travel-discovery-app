# Architecture Decision Records

Record decisions here as they are verified. Do not claim a decision is verified until the relevant docs or tests have been checked.

Status values: **Accepted** (verified and in use), **Proposed** (verified enough to plan with, not yet implemented), **Needs owner decision** (has cost/security/architecture impact), **Needs verification** (facts not yet confirmed).

Facts marked *Verified* below were read from the cited official source on the stated date. Free tiers, limits, and prices change; re-check before relying on them for release or cost decisions.

---

## Phase 0 verification log (checked 2026-10-17)

### Cloudflare Workers + Vite + React
- *Verified*: The official React guide scaffolds React + Vite with `@cloudflare/vite-plugin`, configured as `cloudflare({ viteEnvironment: { name: "worker" } })` after `react()`. Wrangler config uses `assets.not_found_handling: "single-page-application"` and `assets.run_worker_first: ["/api/*"]` to route API paths to the Worker. `npm run dev` runs the Worker in the Workers runtime; `vite build` writes `dist/client` plus an output `wrangler.json`; `vite preview` runs the build locally in the Workers runtime. Add `.wrangler` and `.dev.vars*` to `.gitignore`.
  Source: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- *Verified*: Static asset requests are free and unlimited. Requests matching `run_worker_first` patterns are billed as Worker invocations.
  Source: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- *Verified* (page updated 2026-10-12): Workers Free: 100,000 requests/day (reset 00:00 UTC, Error 1027 when exceeded), 10 ms CPU per HTTP request, 50 subrequests per invocation, 64 MiB Worker size, 20,000 asset files per version, 25 MiB per asset file.
  Source: https://developers.cloudflare.com/workers/platform/limits/
- *Verified*: Bindings use local simulations during local development by default; **Workers AI always runs remotely**, and remote calls incur standard usage. `remote: true` opts a binding into remote mode; writes through remote bindings modify real data.
  Source: https://developers.cloudflare.com/workers/development-testing/
- *Verified*: `workers.dev` is recommended for personal/hobby use; production should use a route or custom domain. Disabling `workers.dev` does not disable Version, Preview, or Deployment URLs. Dashboard-only changes are overwritten by the next `wrangler deploy` unless `workers_dev` is set in config.
  Source: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

### Cloudflare D1
- *Verified* (page updated 2026-04-21): Workers Free: 10 databases, 500 MB per database, 5 GB per account, 50 queries per Worker invocation, 7-day Time Travel. Workers Paid: 10 GB per database, 1,000 queries per invocation, 30-day Time Travel.
  Source: https://developers.cloudflare.com/d1/platform/limits/
- *Verified*: Free plan: 5 million rows read/day, 100,000 rows written/day, 5 GB storage; daily limits reset 00:00 UTC. When exceeded, queries fail until reset (no automatic billing on the Free plan).
  Source: https://developers.cloudflare.com/d1/platform/pricing/
- *Verified*: Migrations are numbered SQL files applied with `wrangler d1 migrations create|list|apply`, tracked in a `d1_migrations` table. `migrations_dir` (default `migrations/`), `migrations_table`, and `migrations_pattern` (supports nested layouts such as Drizzle's `migrations/<n>/migration.sql`) are set on the D1 binding. Use `PRAGMA defer_foreign_keys = true` in migrations that temporarily violate foreign keys.
  Source: https://developers.cloudflare.com/d1/reference/migrations/
- *Needs verification (Phase 1)*: exact `--local`/`--remote` flag behavior, seeding commands, and backup/export procedure (not covered by the migrations page).

### Cloudflare Access (admin protection)
- *Verified*: A self-hosted Access application requires **an active domain (zone) on Cloudflare** (full or partial setup) or a Cloudflare for SaaS custom hostname.
  Source: https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
- *Verified*: Access can be enabled for a Worker's `workers.dev` URL and/or its preview URLs. The docs describe this at the level of the Worker's URLs, not individual paths.
  Source: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- *Verified*: Application path rules support wildcards; `example.com/alpha/*` matches `example.com/alpha/one` but **not** `example.com/alpha`. More specific paths override broader ones; a specific path with its own rule does not inherit the parent's rules. Query strings, ports, and `#` are not supported in paths.
  Source: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- *Verified* (page updated 2026-05-06): Workers should validate the `Cf-Access-Jwt-Assertion` header (not the `CF_Authorization` cookie) using `jose` (`createRemoteJWKSet` + `jwtVerify`) against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking issuer (team domain) and audience (application AUD tag). Keys rotate about every 6 weeks; do not hard-code them. Return 403 when the header is missing or invalid.
  Source: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- *Verified* (page updated 2026-10-16): default limit of 500 Access applications per account.
  Source: https://developers.cloudflare.com/cloudflare-one/account-limits/
- *Partially verified*: Zero Trust Free plan is listed on the Cloudflare pricing page as $0 for up to 50 users. This came from a search summary of https://www.cloudflare.com/plans/zero-trust-services/ and community posts, not from developer docs; re-check the pricing page before relying on it.
- *Not verified*: whether one Access application can list several distinct paths (`/admin`, `/admin/*`, `/api/admin/*`) as separate destinations; which identity providers (e.g. One-time PIN) are available on the Free plan.

### Workers AI
- *Verified* (page updated 2026-10-15): 10,000 Neurons/day free on both Free and Paid plans; $0.011 per 1,000 Neurons above that on Paid. On Workers Free, operations fail with an error after the daily allocation is used. Reset 00:00 UTC.
  Example prices per million tokens (input / output): `llama-3.2-3b-instruct` 4,625 / 30,475 Neurons; `llama-3.1-8b-instruct-fp8-fast` 4,119 / 34,868 Neurons; `gemma-4-26b-a4b-it` 9,091 / 27,273 Neurons; `qwen3-30b-a3b-fp8` 4,625 / 30,475 Neurons.
  Source: https://developers.cloudflare.com/workers-ai/platform/pricing/
- *Estimate (not a guarantee)*: one explanation request with ~1,500 input and ~500 output tokens on `llama-3.1-8b-instruct-fp8-fast` ≈ 6 + 17 ≈ 23 Neurons, i.e. very roughly 400 requests/day inside the free allocation. Recalculate with the real prompt in Phase 4.
- *Verified*: Text-generation rate limit is 300 requests/minute by default; inferences run during local development count toward the limits.
  Source: https://developers.cloudflare.com/workers-ai/platform/limits/
- *Verified*: Binding is configured with `"ai": { "binding": "AI" }` and invoked with `env.AI.run(model, input)`.
  Source: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- *Needs verification (Phase 4)*: model choice, model terms/data handling, structured-output (JSON mode) support, and model deprecation schedule.

### Package versions and compatibility (from the npm registry, 2026-10-17)

| Package | Version | Compatibility evidence |
|---|---|---|
| Node.js (local) | 24.19.0 | `react-router` requires `>=22.22.0`; `vitest` 5 requires `^22.12 \|\| ^24 \|\| >=26`; `wrangler` requires `>=22` |
| npm | 11.17.0 | lockfile: `package-lock.json` |
| react / react-dom | 19.3.1 | `react-router` peer `>=19.2.7` |
| react-router | 8.4.0 | Data mode (`createBrowserRouter`), documented at https://reactrouter.com/start/modes |
| vite | 8.3.4 | `@cloudflare/vite-plugin` peer `^6.1 \|\| ^7 \|\| ^8`; `@vitejs/plugin-react` 6 peer `^8` |
| @vitejs/plugin-react | 6.1.2 | |
| @cloudflare/vite-plugin | 1.64.0 | peer `wrangler ^4.151.0` |
| wrangler | 4.151.1 | bundles workerd `1.20261012.x` |
| @cloudflare/workers-types | 5.20261016.1 | used via `tsconfig.worker.json` |
| typescript | **6.0.3** (not 7.0.2) | `typescript-eslint` 8.71.2 peer is `>=4.8.4 <6.1.0`, so TypeScript 7 is not yet supported by the linter |
| eslint / @eslint/js | 10.13.0 / 10.0.1 | `typescript-eslint` peer `^8.57 \|\| ^9 \|\| ^10` |
| typescript-eslint | 8.71.2 | |
| eslint-plugin-react-hooks / -react-refresh | 7.1.1 / 0.5.7 | peer `eslint ^10` supported |
| vitest | 5.0.5 | peer `vite ^6.4 \|\| ^7 \|\| ^8`; `@cloudflare/vitest-plugin` 1.4.4 peer `vitest ^4.1 \|\| ^5` |
| jsdom / @testing-library/react | 30.1.3 / 16.3.3 | |
| i18next / react-i18next | 26.4.7 / 17.0.20 | `react-i18next` peer `i18next >=26.2`, `typescript ^5 \|\| ^6 \|\| ^7` |

Checked but **not installed in Phase 0** (added in the phase that needs them; re-check versions then):
`zod` 4.6.7, `drizzle-orm` 0.45.4 (stable) / 1.0.0-rc.4, `drizzle-kit` 0.31.11, `hono` 4.13.13, `jose` 6.2.12, `@cloudflare/vitest-plugin` 1.4.4, `@playwright/test` 1.64.1, `tailwindcss` / `@tailwindcss/vite` 4.3.3, `motion` 14.3.0.

Notes:
- `@cloudflare/vitest-pool-workers` (latest 0.23.0, peer `vitest ^4.1`) is superseded by `@cloudflare/vitest-plugin`; Cloudflare publishes a migration guide. Use the new plugin for Workers-runtime tests in Phase 1.
  Source: https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/
- Install scripts (`workerd`, `esbuild`): see ADR-016. *Correction (2026-10-17)*: an earlier version of this note said the scripts "did not run". That was wrong; under npm 11's default policy they ran (with a notice), which is visible because `node_modules/.bin/{esbuild,workerd}` are native executables rather than the JavaScript shims.

---

## ADR-001: SPA and hosting
- Status: **Accepted** (Phase 0)
- Decision: The public app is a React + TypeScript + Vite SPA, deployed as one Cloudflare Worker with static assets via `@cloudflare/vite-plugin`. The admin console is a separate Worker (ADR-004); this ADR covers the public Worker. API routes live under `/api/*` and are the only paths that invoke the Worker (`run_worker_first: ["/api/*"]`); everything else is served as static assets with SPA fallback.
- Rationale: One deployment surface; static asset requests are free and do not consume Worker invocations.
- Verified locally: `vite` dev server serves the SPA and `/api/health` from the Workers runtime; `vite preview` serves the production build with SPA fallback for deep links.
- Alternatives: Cloudflare Pages (not chosen; the current React guide targets Workers), React Router framework mode (not needed without SSR).
- `compatibility_date` is set to `2026-10-12` to match the installed workerd runtime. Update intentionally, not automatically.

## ADR-002: Database
- Status: Proposed (implementation in Phase 1)
- Decision: Cloudflare D1, local simulation for development (default), separate preview and production databases.
- Rationale: Relational content data; Free-plan limits (500 MB/database, 5M reads/day, 100k writes/day, 50 queries/invocation) comfortably fit a content-driven app with no user data. The 50-queries-per-invocation limit means public endpoints must load content in a small number of batched queries.
- Open items: seeding and backup/export procedure (see verification log).

## ADR-003: ORM and validation
- Status: **Accepted by the owner (2026-10-17)**; implementation in Phase 1. The 1.0 RC is explicitly not adopted.
- Decision: **Drizzle ORM 0.45.x (latest stable, 0.45.4 on 2026-10-17) with drizzle-kit 0.31.x**, plus Zod for API input and AI output validation. Pin to the 0.45 minor line (`~0.45.4`) so an accidental 1.0 upgrade cannot happen through `npm update`.
- Migration flow: write the schema in TypeScript → `drizzle-kit generate` produces SQL → review the SQL → apply with `wrangler d1 migrations apply` (local first, remote only with approval). Wrangler remains the single tool that applies migrations; drizzle-kit never pushes directly to a remote database.
- Rationale: typed schema and queries with plain SQL migrations that can be reviewed; stable release per CLAUDE.md. Wrangler's `migrations_pattern` supports Drizzle's nested output layout if needed.
- Risks: Drizzle's D1 guide now installs the 1.0 RC (`@rc`) and promotes a v1.0 upgrade, so examples in current docs may not match 0.45 APIs exactly; a later 1.0 migration is expected. Phase 1 must re-check the 0.45 docs for the D1 driver import (`drizzle-orm/d1`) and the drizzle-kit config before writing code.
- Alternatives: Drizzle 1.0 RC (rejected for now: pre-release); no ORM with hand-written SQL and Zod-validated rows (viable fallback if Drizzle 0.45 turns out to be awkward with D1).

## ADR-004: Admin authorization
- Status: **Accepted by the owner (2026-10-17)**; implementation in Phase 1. See "Admin protection re-evaluation" for the comparison and "Admin authentication status" for what is implemented, tested, and deploy-only.
- Decision: **a separate admin Worker, entirely protected by Worker-level Cloudflare Access ("All traffic")**, with JWT validation inside every admin API handler. The public Worker has no admin editing functions. The admin Worker initially uses its `workers.dev` hostname; a Custom Domain on a subdomain of an owner zone is **deferred** by the owner.
- Identity provider: Cloudflare Zero Trust Free is the candidate. Available login methods (including One-time PIN), seat limits, and pricing terms are confirmed in the dashboard at setup time, not assumed here.
- Invariants:
  1. The public Worker contains no admin API routes and no admin data-mutation code, so no URL of the public Worker can reach admin functions.
  2. Every admin API request is authorized inside the Worker by validating the `Cf-Access-Jwt-Assertion` JWT with `jose` (signature via the team JWKS, issuer = team domain, audience = the admin application's AUD). Missing header, invalid token, or missing `ACCESS_TEAM_DOMAIN`/`ACCESS_POLICY_AUD` configuration → 403 (fail closed). Edge protection alone is never trusted.
  3. All hostnames that reach admin code (workers.dev, Version URLs, routes, Custom Domains) are covered by Access, or disabled. The admin Worker sets `preview_urls: false` unless previews are explicitly needed.
  4. No hostname/path Access application with a Bypass policy may match an admin hostname (more specific apps take precedence over Worker-level Access).
  5. Tests assert that every admin endpoint returns 403 without a valid token, including tokens with the wrong audience/issuer and expired tokens.
- Local development: Access does not run locally. Phase 1 will provide test JWTs signed with a locally generated key (injected JWKS) for tests, and an explicit local-only identity mechanism that is impossible to enable in deployed configuration. Design to be reviewed with the owner in Phase 1.
- C (homemade password/session auth) remains **rejected** per CLAUDE.md.

## ADR-005: AI provider
- Status: Proposed (implementation in Phase 4)
- Decision: Cloudflare Workers AI through the `AI` binding, behind a small `RecommendationExplanationProvider` interface.
- Facts: 10,000 Neurons/day free; operations fail on the Free plan after the allocation is used (no surprise bills on Free). Local development calls the real remote service and counts toward usage and rate limits.
- Phase 4 must confirm: model choice and terms, JSON/structured output support, per-request token limits, and a server-side daily request budget so one user cannot exhaust the shared allocation.
- No AI binding is configured in Phase 0.

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

## ADR-012: Application locales and i18n library
- Status: **Accepted** (Phase 0)
- Decision: `i18next` + `react-i18next`. Supported locales `ja`, `en`, `es`; default `ja`.
- Structure:
  - `src/i18n/locales.ts`: locale list, default, fallback chain, `isLocale` guard.
  - `src/i18n/messages/{ja,en,es}.ts`: UI message catalogs as TypeScript objects. `ja` defines the `Messages` type; `en` and `es` are annotated with it, so a missing or extra key is a **compile error**. A unit test also rejects blank strings.
  - `src/i18n/i18next.d.ts`: `CustomTypeOptions` so `t()` keys are type-checked.
  - `DocumentMetadata` keeps `<html lang>` and `document.title` in sync with the active locale.
- Fallback policy: **`ja → en`, `en → ja`, `es → en → ja`** (accepted by the owner 2026-10-17; implemented in `src/i18n/locales.ts` and covered by `src/i18n/createI18n.test.ts`). Unsupported language codes resolve to `ja`.
  - Rationale: English is the most likely second language for Spanish-speaking users; Japanese is the authoring language and the final safety net; English is the closest widely-read alternative for Japanese users when an `ja` translation is missing.
  - UI strings must be complete in every locale (compile-time check), so fallback only matters for admin-entered content. Published seeded content must have all three translations. When content falls back, the UI marks the text with the correct `lang` attribute and a visible "shown in <language>" hint (Phase 1 data layer returns the locale actually used; Phase 3 renders the hint).
- Rationale: Mature, widely used, typed keys via `CustomTypeOptions`, supports React 19 and TypeScript 6; TypeScript catalogs give stronger guarantees than JSON without extra tooling.
- Alternatives considered: JSON catalogs (lose compile-time key parity), lighter custom context (would re-implement plurals, interpolation, fallback).
- **Deferred to Phase 3 routing design**: whether the locale is reflected in the URL (e.g. `/en/...`) and whether the choice is persisted in `localStorage`. Until then the locale is in-memory only and defaults to `ja` on every load. Phase 1/2 APIs must therefore accept the locale as an explicit, validated parameter rather than inferring it from the URL path, so either routing choice remains possible.

## ADR-013: Toolchain and package manager
- Status: **Accepted** (Phase 0)
- Decision: npm with committed `package-lock.json`; Node `>=22.22.0` (`.nvmrc` pins 24 for local development). TypeScript 6.0 with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`, split into `tsconfig.app.json` (browser), `tsconfig.worker.json` (Workers types), and `tsconfig.node.json` (config files). ESLint 10 flat config with `typescript-eslint` `strictTypeChecked`, React Hooks, and React Refresh rules. Vitest 5 with Node by default and jsdom per file.
- Rationale: npm ships with Node, needs no extra install, and is what Cloudflare's guides show first. TypeScript 7 is postponed until `typescript-eslint` supports it.
- No `deploy` script is defined, to avoid accidental deployment. Deployment commands will be added in Phase 5/6 with approval.

## ADR-014: UI styling stack timing
- Status: Proposed
- Decision: Tailwind CSS, shadcn/ui, and Motion are deferred to Phase 3. Phase 0 uses a small hand-written stylesheet with visible focus styles and light/dark colors.
- Needs verification in Phase 3: shadcn/ui compatibility with Tailwind 4.3, React 19.3, and Vite 8.

## ADR-015: Start on Workers Free and fail gracefully at limits
- Status: **Accepted by the owner (2026-10-17)**
- Decision: Launch the MVP on the Workers Free plan. Exceeding a Free limit produces errors, not charges (verified for Workers requests, D1 daily reads/writes, and Workers AI Neurons; see verification log). When AI or any external service fails, the core diagnostic keeps working wherever possible.
- API error contract (all Workers): JSON body `{ "error": "<stable_code>" }` only. No stack traces, SQL, provider messages, binding names, or internal IDs are ever returned; details go to controlled server logs without request bodies or answers.

  | Status | When | Example code |
  |---|---|---|
  | 400 | Malformed or schema-invalid input (Zod) | `invalid_request` |
  | 403 | Admin request without a valid Access JWT (missing, bad signature/issuer/audience, expired, or auth config missing) | `forbidden` |
  | 404 | Unknown route or unpublished/missing resource | `not_found` |
  | 405 | Method not allowed (with `Allow` header) | `method_not_allowed` |
  | 409 | Admin write conflicts (duplicate slug, stale update) | `conflict` |
  | 413 | Request body over the size limit | `payload_too_large` |
  | 429 | App-level rate limit exceeded (AI/admin endpoints) | `rate_limited` |
  | 503 | Dependency unavailable: D1 errors including daily limits, AI unavailable/over quota/timeout | `service_unavailable`, `ai_unavailable` |
  | 500 | Unexpected bug (caught by a top-level handler) | `internal_error` |

  Implemented so far: 404, 405 and the JSON/no-store contract in `worker/index.ts` (tested). The rest is implemented with the endpoints that need them.
- Required application behavior:
  - Public API: map D1 errors (including daily-limit errors) to `503 service_unavailable`. The UI shows a localized "temporarily unavailable, please try again later" state with retry.
  - AI explanation endpoint: any AI failure returns `503 ai_unavailable` (or the client times out); the results page already contains the deterministic explanation, so the user only sees a non-blocking notice.
  - Static assets keep working when the Worker request quota is exhausted (asset requests do not invoke the Worker), so the shell UI can always render and show the error state.
  - Workers request quota (Error 1027) is returned by the platform before the Worker runs; the SPA must treat non-JSON or unexpected API responses as the same "temporarily unavailable" state.
  - AI (Phase 4): quota errors fall back to the deterministic explanation with a non-blocking notice, per SPEC §8.
  - Design for the 50-queries-per-invocation and 10 ms CPU limits: load public content in a few batched queries and keep scoring cheap.
- Revisit: if real usage approaches the limits, present Workers Paid costs to the owner before upgrading.

## ADR-016: npm install scripts (`allowScripts`)
- Status: **Accepted by the owner and applied (2026-10-17)**: `allowScripts` denies in `package.json` and `strict-allow-scripts=true` in `.npmrc`.
- Documentation (checked 2026-10-17, npm 11.17.0):
  - `allowScripts` is advisory by default: unapproved dependency install scripts **still run**, with a notice. npm states a future release will block unreviewed scripts.
    Sources: https://docs.npmjs.com/cli/v11/using-npm/config#allow-scripts, https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts
  - The docs contradict each other on `false` entries: the config docs say denied dependencies "are always silently skipped", while `npm help deny-scripts` says that in the current release deny "only affects how installs of denied packages are reported". The behavior was therefore measured (below).
- Measured behavior with npm 11.17.0 on macOS (`npm ci` in scratch copies of this repo, 2026-10-17):

  | Setting | Result |
  |---|---|
  | Default (no `allowScripts`) | Install succeeds; `esbuild`/`workerd` scripts **run** (native binaries linked into `bin/`); warning lists 3 packages |
  | `allowScripts` with `false` for `esbuild`, `workerd` | Install succeeds; those scripts are **skipped** (`bin/` stays a JS launcher) |
  | `strict-allow-scripts=true`, no entries | Install **fails** (`ESTRICTALLOWSCRIPTS`) |
  | `strict-allow-scripts=true` + entries for only `esbuild`, `workerd` | Install **fails** on macOS because `fsevents` is unreviewed |
  | `strict-allow-scripts=true` + `false` for `esbuild`, `fsevents`, `workerd` | Install succeeds; lockfile unchanged; lint, type-check, 22 tests, build, `vite preview` with `/api/health`, and loading `fsevents` all work |

  So on npm 11.17.0, `false` entries **are enforced** and `strict-allow-scripts` **does** block unreviewed scripts. Because the docs disagree, re-run this check after npm upgrades.
- Packages with install scripts (`npm approve-scripts --allow-scripts-pending`, lockfile `hasInstallScript`):
  - `workerd@1.20261012.1`, `esbuild@0.28.2`: `postinstall: node install.js`.
  - `fsevents@2.3.3` (macOS-only optional dependency of `vite` and `wrangler`): no explicit install script; npm infers an implicit `node-gyp` build. The package ships a prebuilt `fsevents.node`, which loads without the build. It is not installed on Linux/Windows, so it only affects macOS installs.
  - What the scripts do (read from `node_modules/*/install.js` and esbuild's docs): verify that the platform binary from `optionalDependencies` is present and the right version; if it is missing, download it from `registry.npmjs.org`; then replace the JavaScript launcher in `bin/` with a hard link to the native binary as a speed optimization. esbuild's docs state the binary is still installed from optional dependencies when scripts are skipped, at the cost of an extra Node process per CLI call.
    Source: https://esbuild.github.io/getting-started/
  - Verified in a scratch copy with `npm ci --ignore-scripts`: lint, type-check, tests, build, `vite preview`, and `workerd --version` all work without the scripts. The lockfile contains platform packages for macOS, Linux, and Windows, so `npm ci` is reproducible across OSes.
- Conclusion: none of the three scripts is required for this project as long as optional dependencies are installed (never use `--omit=optional`).
- Applied configuration (allow nothing, because nothing is needed):
  - `package.json`: `"allowScripts": { "esbuild": false, "fsevents": false, "workerd": false }` (name-only denies, as written by `npm deny-scripts`).
  - `.npmrc`: add `strict-allow-scripts=true`, so any new dependency with install scripts fails `npm ci` until someone reviews it and adds an explicit entry.
  - Reproducibility: the denies make installs behave the same on every OS (scripts never run) instead of depending on platform-specific script execution.
- What this does and does not protect against (stated precisely):
  - It does prevent install-time code from these three packages running on developer machines and CI, and it makes new install scripts visible as a hard failure instead of a warning, on npm versions that enforce the policy (verified on 11.17.0).
  - It does **not** protect against malicious code in the packages' runtime code: `esbuild`, `workerd`, and every other dependency still execute during `dev`, `build`, and `test`. Supply-chain protection still relies on the lockfile integrity hashes, `npm ci`, reviewing dependency updates, and `npm audit`.
  - It has no effect on npm versions older than the `allowScripts` feature; such npm versions run scripts as before. `engine-strict` only checks the Node version, not npm's.
  - `--ignore-scripts` (or `ignore-scripts=true`) would also skip scripts but disables all lifecycle scripts, including this project's own; the explicit allowlist is narrower and self-documenting.
- If a future dependency needs an install script, approve it pinned (`npm approve-scripts <pkg>`), never with `--all`, and never use `dangerously-allow-all-scripts`.

## ADR-017: Baseline HTTP security headers
- Status: **Accepted** (Phase 0)
- Decision: `public/_headers` sets a strict Content-Security-Policy (`'self'` only, `frame-ancestors 'none'`, `img-src` also allows `https:` and `data:` for future destination images), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy` for static assets. `_headers` does not apply to Worker responses, so API responses set `Cache-Control: no-store` and `nosniff` in `worker/index.ts`.
- Verified with `vite preview`: headers present on `/`, SPA deep links, and `/api/health`; the page renders with no CSP console errors.
  Source: https://developers.cloudflare.com/workers/static-assets/headers/
- Revisit when external images, fonts, or AI streaming are added.

## ADR-018: Shared D1 database for the public and admin Workers
- Status: **Accepted by the owner (2026-10-17)** as the Phase 1 design; nothing implemented yet.
- **Important limitation: the public Worker's "read-only" status is a constraint enforced by code structure, lint rules, and tests. It is NOT a database-level read-only permission.** D1 offers no read-only binding, so the public Worker's binding can technically execute writes; the controls below only make an accidental or unreviewed write path fail review/CI.
- Facts (checked 2026-10-17):
  - *Not found in docs*: any read-only D1 binding or per-binding permission. A Worker with a D1 binding can run any SQL statement. Account roles and API tokens (e.g. read-only roles for the `/query` REST API) restrict people and tokens, not Worker bindings.
    Sources: https://developers.cloudflare.com/d1/worker-api/, https://developers.cloudflare.com/workers/authorization/
  - *Verified*: `PRAGMA query_only` is **not** in D1's list of supported PRAGMAs, and D1 PRAGMAs apply only to the current transaction, so it cannot be used as a read-only guard.
    Source: https://developers.cloudflare.com/d1/sql-api/sql-statements/
  - *Verified*: Service bindings let one Worker call another without a public URL (RPC via `WorkerEntrypoint`); Access context is not propagated across them.
    Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
  - *Not explicitly documented*: binding the same `database_id` from two Workers. It is the normal way bindings work and is expected to be supported; confirm when the database is created (Phase 1, with approval).
- Configuration design:
  - One D1 database per environment (local, preview, production). Both `wrangler` configs bind it by the same `database_id`; binding names differ (`PUBLIC_DB` in the public Worker, `ADMIN_DB` in the admin Worker) so code cannot be copy-pasted across the boundary unnoticed.
  - **Only the admin Worker's config owns migrations** (`migrations_dir`); the public config binds the database without migration settings. Migrations are applied only through the admin config, locally first and remotely only with owner approval.
  - Local development runs two Wrangler/Vite processes. They must share one local D1 state (a common persistence directory), otherwise each Worker sees a separate local database. Exact flags/options for the Vite plugin are *not verified*; settle this in Phase 1.
- Write prevention on the public side (code-level controls only, because the platform offers no read-only binding):
  1. Code layout separates `public` and `admin` Worker sources, with a shared read-only query module and an admin-only write module.
  2. ESLint `no-restricted-imports` forbids the public Worker from importing admin modules or write helpers; a test also scans the public Worker bundle/sources for `insert`/`update`/`delete` query builders and raw write SQL.
  3. The public Worker exposes only `GET`/`HEAD` routes; any other method returns `405`. All queries are parameterized (Drizzle), and public endpoints never accept SQL fragments, column names, or sort expressions from clients except from fixed allowlists.
  4. Public queries filter `status = 'published'` and select explicit columns only.
- Residual risk (accepted for MVP): these controls do not stop a bug that slips past review, or a compromised dependency running inside the public Worker, from writing through its binding. Stronger isolation option, if needed later: remove the D1 binding from the public Worker and read through a service binding to a private, read-only "content" Worker with no public URL. Not chosen now because it adds a third Worker and more invocations for little MVP benefit.

---

## Admin authentication status (2026-10-17)

Separates what exists today from what is only designed, so nothing is claimed as protected before it is.

| Item | Implemented now | Verified by tests | Verifiable only after an approved deployment |
|---|---|---|---|
| Admin Worker exists, separate from the public Worker | No (Phase 1) | — | — |
| Public Worker contains no admin routes or write code | Yes (only `/api/health`; unknown `/api/*` → 404 JSON) | Partly: `worker/index.test.ts` checks unknown API paths return 404 | — |
| Worker-level Access ("All traffic") on the admin Worker | No (dashboard/API setting; requires approval) | — | Yes: unauthenticated request to admin `workers.dev` URL is redirected to Access login |
| Access covers admin Version URLs, or `preview_urls: false` on the admin Worker | No | — | Yes: Version URLs either disabled or behind login |
| No Bypass hostname/path app matches admin hostnames | No (configuration rule) | — | Yes: review Access apps list |
| JWT validation (`jose`, JWKS from team domain, issuer + AUD) in every admin API handler | No (Phase 1) | Planned: valid token accepted; missing header, bad signature, wrong issuer, wrong AUD, expired token, and missing config → 403, using locally generated keys | Yes: real tokens from Access validate against the real JWKS |
| `Cf-Access-Jwt-Assertion` reaches the Worker through the static-assets router (`run_worker_first`) | — | Cannot be tested locally | Yes (currently *not verified*; admin API fails closed until confirmed) |
| Public Worker Version URLs disabled | Yes: `"preview_urls": false` in `wrangler.jsonc` | Build output contains `"preview_urls":false` (checked manually) | Yes: no Version URL is served after deploy |
| Public `workers.dev` stays enabled (it is the public site until a domain is chosen) | Default | — | — |
| Custom Domain for admin | Deferred by owner | — | — |

---

## Admin protection re-evaluation (2026-10-17)

### Additional verified facts
- *Verified* (page updated 2026-10-12): **Worker-level Access** protects "every domain associated with the Worker": routes, Custom Domains, the `workers.dev` hostname, and previews. It is not path-scoped. Scope can be "Previews only" or "All traffic". Requires Zero Trust to be enabled on the account. Worker-level policies do not support WebSockets.
  Source: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- *Verified* (same page): precedence is **hostname/path Access apps → Worker-level Access → account-level Worker Access**. A more specific hostname/path app (including one with a Bypass policy) overrides Worker-level protection for matching URLs. Removing a rule can expose a broader one.
- *Verified* (same page): `ctx.access` / `ctx.access.getIdentity()` give the authenticated identity without JWT parsing, but **Workers with Static Assets run behind an internal router that does not pass `ctx.access` to the user Worker**, and `ctx.access` is not propagated across Service Bindings or RPC. Because this app uses static assets, admin APIs must validate the `Cf-Access-Jwt-Assertion` header themselves.
- *Verified*: Version URLs (`<version>-<worker>.<subdomain>.workers.dev`) are only on `workers.dev`, follow the `workers_dev` setting by default, are **publicly available when enabled**, and are disabled with `"preview_urls": false`.
  Source: https://developers.cloudflare.com/workers/configuration/previews/
- *Verified*: A Worker Custom Domain can be a subdomain (including multi-level) of an active zone the owner already has; it cannot be created on a hostname that already has a CNAME record. No Advanced Certificate Manager subscription is needed.
  Source: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- *Not verified*: whether the `Cf-Access-Jwt-Assertion` header reaches the user Worker unchanged when the request passes the static-assets router with `run_worker_first` (expected, because Access adds it before the request reaches the Worker, but not stated). This must be checked on a protected preview deployment in Phase 1 **with owner approval**; until confirmed, the admin API fails closed when the header is absent.
- *Not verified*: Access path matching details (case sensitivity, trailing slashes, percent-encoded or duplicate slashes). This is a reason to avoid path-scoped protection for admin APIs.
- *Not verified*: whether `workers.dev` stays enabled after adding a Custom Domain (set `workers_dev` explicitly in config either way); whether two Workers binding the same D1 database needs any special configuration (expected to be supported; confirm in Phase 1).

### Comparison

| | 1. Worker-level Access on the single app Worker | 2. Path-scoped Access app on a custom (sub)domain, single Worker | 3. Separate admin Worker + Worker-level Access (**recommended**) |
|---|---|---|---|
| Fits a public site? | **No** — "All traffic" protects the whole Worker, including the public site. Only usable as "Previews only". | Yes | Yes (public Worker is unprotected; admin Worker is fully protected) |
| Domain needed | No | **Yes** — an active zone; a subdomain of an existing owner zone (e.g. `travel.<domain>`) works | No; optional Custom Domain on a subdomain of an existing zone (e.g. `travel-admin.<domain>`) |
| Admin UI + API covered | — | Only if the app lists `/admin`, `/admin/*` and `/api/admin/*` correctly (`/x/*` does not cover `/x`) | Yes: every hostname of the admin Worker is covered automatically |
| Bypass via other URLs | — | **Risk**: `workers.dev`, Version URLs, extra routes/domains are not covered by the path app; must disable (`workers_dev: false`, `preview_urls: false`) and keep it that way | Low: Worker-level Access covers `workers.dev`, previews, routes, Custom Domains. Public Worker has no admin code to reach |
| Path-matching pitfalls | — | **Risk**: matching details for case/encoding/slashes are unverified | None (whole hostname/Worker) |
| Identity in Worker | JWT header (ctx.access unavailable with static assets) | JWT header | JWT header |
| Precedence risk | — | A broader or misconfigured app could shadow rules | A hostname/path Bypass app matching the admin hostname would override; forbidden by invariant 4 |
| Complexity | Low | Low–medium (one Worker, careful Access config) | Medium (two Workers/configs/deploys, shared code and schema) |
| Cost | Zero Trust Free | Zero Trust Free + domain (no extra if the owner already has a zone) | Zero Trust Free; domain optional |

Variant of option 2 using an existing zone: give the public app `travel.<domain>` and protect a **separate admin hostname** (`travel-admin.<domain>`) with a hostname-level Access app instead of paths, both routed to the same Worker, with the Worker refusing admin routes unless the Host header is the admin hostname **and** the JWT is valid. This avoids path-matching issues but still ships admin code in the public Worker and still requires disabling `workers.dev` and Version URLs; option 3 gives the same separation structurally with fewer ways to misconfigure.

Why option 3: it is the only option where an Access misconfiguration on the public side cannot expose admin functions, because the public Worker has none; it works with or without a domain; and the Worker-level setting covers every URL of the admin Worker, including `workers.dev` and previews. **The owner accepted option 3 on 2026-10-17** (ADR-004); a Custom Domain is deferred.

---

## Open questions (要確認 — items needing the owner's decision or later verification)

Decided by the owner on 2026-10-17: separate admin Worker (ADR-004), Drizzle 0.45.x (ADR-003), locale fallback chain (ADR-012), Workers Free with graceful failure (ADR-015), install-script policy (ADR-016), shared D1 with a code-level read-only boundary (ADR-018). Custom Domain deferred; no deployment or external resource without explicit approval.

1. **Zero Trust Free plan**: confirm available login methods (including One-time PIN), seat limit, and pricing terms in the dashboard at setup time.
2. **Shared D1 (ADR-018)**: revisit the private content Worker option if the code-level read-only boundary proves insufficient.
3. **Deploy-only verifications** (need approval when Phase 1 reaches them): Access coverage of the admin Worker's `workers.dev` and Version URLs; `Cf-Access-Jwt-Assertion` delivery through the static-assets router; two Workers binding one D1 database.
4. **Locale in URL**: deferred to Phase 3 routing design.
