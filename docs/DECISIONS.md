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
- *Needs verification (Phase 4)*: model choice, model terms/data handling, structured-output (JSON mode) support, and model deprecation schedule. *Update (2026-10-18)*: see "Phase 4 verification log". `llama-3.1-8b-instruct-fp8-fast`, used for the estimate above, is still priced but no longer listed in the model catalog.

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

Added in Phase 1 (versions re-checked on the npm registry, 2026-10-17): `drizzle-orm ^0.45.4`, `drizzle-kit ^0.31.11`, `zod 4.6.7`, `hono 4.13.13`, `jose 6.2.12` (runtime) and `@cloudflare/vitest-plugin 1.4.4` (peer `vitest ^4.1 || ^5`).

Checked but not installed yet (added in the phase that needs them; re-check versions then):
`@playwright/test` 1.64.1, `tailwindcss` / `@tailwindcss/vite` 4.3.3, `motion` 14.3.0.

Notes:
- `@cloudflare/vitest-pool-workers` (latest 0.23.0, peer `vitest ^4.1`) is superseded by `@cloudflare/vitest-plugin`; Cloudflare publishes a migration guide. Use the new plugin for Workers-runtime tests in Phase 1.
  Source: https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/
- Install scripts (`workerd`, `esbuild`): see ADR-016. *Correction (2026-10-17)*: an earlier version of this note said the scripts "did not run". That was wrong; under npm 11's default policy they ran (with a notice), which is visible because `node_modules/.bin/{esbuild,workerd}` are native executables rather than the JavaScript shims.

---

## Phase 4 verification log (checked 2026-10-18)

Read from official documentation only; no Cloudflare login, account setting, or model call was made. Used by ADR-026.

### Workers AI models and pricing
- *Verified* (page updated 2026-10-15): prices per million tokens (input / output), in Neurons; $0.011 per 1,000 Neurons above the free 10,000 Neurons/day.

  | Model | Input | Output | Est. Neurons per request (1,500 in / 500 out) | Est. requests/day in the free allocation |
  |---|---|---|---|---|
  | `@cf/meta/llama-3.1-8b-instruct-fp8` | 13,778 | 26,128 | ≈ 34 | ≈ 290 |
  | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 26,668 | 204,805 | ≈ 142 | ≈ 70 |
  | `@cf/google/gemma-4-26b-a4b-it` | 9,091 | 27,273 | ≈ 27 + reasoning tokens | ≤ 360 |
  | `@cf/qwen/qwen3-30b-a3b-fp8` | 4,625 | 30,475 | ≈ 22 + reasoning tokens | ≤ 450 |

  The estimates are arithmetic on an assumed prompt size, not measurements; recalculate with the real prompt (ADR-026 Stage 5). Some other models on the page (marked there) require a paid billing method and are not candidates.
  Source: https://developers.cloudflare.com/workers-ai/platform/pricing/
- *Verified*: the model catalog lists `llama-3.1-8b-instruct-fp8` but not the `-fp8-fast`, `-awq`, or plain `llama-3.1-8b-instruct` variants that still appear on the pricing page. No text-generation model is labelled deprecated in the catalog. Treat catalog presence as the availability signal and re-check before release.
  Source: https://developers.cloudflare.com/workers-ai/models/
- *Verified* (model pages, no update date shown):
  - `llama-3.1-8b-instruct-fp8`: 32,000-token context, default `max_tokens` 256, `response_format` in the input schema, license: Meta Llama 3.1 license (linked).
  - `llama-3.3-70b-instruct-fp8-fast`: 24,000-token context, default `max_tokens` 256, `response_format` in the input schema, license: Meta Llama 3.3 license (linked).
  - `gemma-4-26b-a4b-it`: 256,000-token context, `response_format` in the input schema, `max_tokens` deprecated in favour of `max_completion_tokens`, listed as a **reasoning** model, license linked to Google's Gemma 4 page.
  - `qwen3-30b-a3b-fp8`: 32,768-token context, default `max_tokens` 2,000, `response_format` in the input schema, listed as a **reasoning** model, license not named on the page.
  Sources: https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/, https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/, https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/, https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
- *Verified* (page updated 2026-09-14): JSON mode is requested with `response_format: { type: "json_schema", json_schema }` (or `json_object`). Output "isn't guaranteed" to match the schema; the app must handle the "JSON Mode couldn't be met" error. No streaming in JSON mode. The page's list of supported models (Llama 3/3.1/3.3, Hermes 2 Pro, DeepSeek) does not match the model pages, which show `response_format` for all four candidates above. Whether JSON mode is enforced for Gemma/Qwen therefore needs a real call (Stage 5).
  Source: https://developers.cloudflare.com/workers-ai/features/json-mode/
- *Verified* (page updated 2026-04-21): `env.AI.run(model, inputs)` documents only the `stream` input option; **no timeout or abort mechanism is documented**.
  Source: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- *Verified* (page updated 2026-08-20): Workers AI bindings always run remotely during local development; `remote: false` is an error; `wrangler dev --local` disables remote bindings (no equivalent Vite-plugin flag is described). Whether a remote AI binding requires `wrangler login` when the dev server starts is **not stated** (needs verification without logging in, Stage 3).
  Source: https://developers.cloudflare.com/workers/development-testing/

### Workers AI data handling
- *Verified* (page updated 2026-10-16): Cloudflare does not use Customer Content processed by Workers AI to train models. For standard (non-stateful) inference, inputs and outputs are not kept once the response is returned. Content may be stored if the app writes it to logs or storage, or enables AI Gateway logging/caching. Cloudflare keeps operational metadata (account/model IDs, timestamps, sizes, token/Neuron counts, latency, status codes) without content. Third-party models are governed by their own licenses.
  Source: https://developers.cloudflare.com/workers-ai/platform/data-usage/

### Model licenses (summaries, not legal advice)
- *Verified*: Llama 3.3 license: display "Built with Llama" on a related website/UI/docs when making available a product containing Llama Materials; comply with the Acceptable Use Policy; separate license above 700M MAU. The text does not say whether calling a hosted API counts as "making available".
  Source: https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE
- *Secondary sources only*: the Llama 3.1/3.3 model cards list eight supported languages (English, German, French, Italian, Portuguese, Hindi, Spanish, Thai) — **not Japanese** — and discourage use in other languages without additional fine-tuning and controls (reproduced by https://registry.ollama.ai/library/llama3.3). Our default locale is `ja`.
- *Verified*: Gemma 4 is released under Apache 2.0 (https://ai.google.dev/gemma/docs/gemma_4_license; the page says it is deprecated in favour of gemma.ai). Google's separate terms of use and prohibited-use policy were **not read**.
- *Verified*: Qwen3-30B-A3B-FP8 is Apache 2.0 and claims support for "100+ languages and dialects" without listing them; thinking mode is on by default upstream (`enable_thinking`, `/no_think`). How to turn reasoning off on Workers AI is **not documented** on its model page.
  Source: https://huggingface.co/Qwen/Qwen3-30B-A3B-FP8

### Rate Limiting binding
- *Verified* (page updated 2026-10-12): configured with a `ratelimits` entry (`name`, `namespace_id` as a positive-integer string unique per account, `simple.limit`, `simple.period` of **10 or 60 seconds only**); requires Wrangler ≥ 4.36.0 (installed: 4.151.1). `await env.LIMITER.limit({ key })` returns `{ success }`. Counters are cached on the machine running the Worker and synced asynchronously: the API is "permissive, eventually consistent" and "not … an accurate accounting system". **Limits apply per Cloudflare location**, so a key's total across locations can exceed the configured limit. Bindings sharing a `namespace_id` share counters, even across Workers. Cloudflare recommends keys that identify a user or tenant and warns against IP addresses (shared by many users). Not shown in the dashboard; monitor 429s through logs.
  Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- *Verified* (page updated 2026-08-20): rate limiting bindings are simulated locally and cannot be remote; "Rate limiting logic should be tested against local simulations."
  Source: https://developers.cloudflare.com/workers/development-testing/
- *Not found*: whether the binding is available, limited, or charged on Workers Free. Neither the binding page nor the Workers pricing page (updated 2026-10-02, https://developers.cloudflare.com/workers/platform/pricing/) mentions it, and a community thread asking the same question (https://community.cloudflare.com/t/are-workers-rate-limiting-bindings-free-on-the-workers-free-plan/967562) could not be read (HTTP 403). Confirm in the dashboard or with Cloudflare before relying on it (ADR-026).


### Stage 5 preparation checks (2026-10-18)
Official documentation only; no login, account setting, or model call.
- *Verified* (page updated 2026-10-12): the Vite plugin selects a Wrangler environment with `CLOUDFLARE_ENV` at **dev and build** time; it is ignored by `vite preview` and `wrangler deploy`. Without it, dev and build use the top-level configuration. The build writes a `wrangler.json` flattened to the selected environment.
  Source: https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/
- *Verified* (page updated 2026-09-22): bindings, `vars`, and secrets are non-inheritable: a named environment must declare every binding and variable it needs (for this app also `d1_databases`). The page does not list `ai` or `ratelimits` by name; they are bindings, so treat them as non-inheritable.
  Source: https://developers.cloudflare.com/workers/wrangler/environments/
- *Verified* (page updated 2026-06-25): the Vite plugin option `remoteBindings` (default `true`) controls remote bindings.
  Source: https://developers.cloudflare.com/workers/vite-plugin/reference/api/
- *Verified*: an AI binding without `remote` connects to the remote service and warns; `remote: false` is an error; `wrangler dev --local` disables remote bindings. Whether starting a remote binding needs `wrangler login` is **not stated** (the programmatic API takes an account ID and API token). Treat any configuration that contains an `ai` binding as "may connect to Cloudflare and need credentials".
  Source: https://developers.cloudflare.com/workers/development-testing/
- *Verified* (page updated 2026-10-09): `CF-Connecting-IP` carries the IP address of the client that connected to Cloudflare; without a Worker subrequest it reflects the client IP. `X-Forwarded-For` can contain a client-supplied chain and should not be used for this. With Pseudo IPv4 (a zone setting), IPv6 clients can appear as Class E IPv4 addresses with the real address in `CF-Connecting-IPv6`. The page does not explicitly say that a client-supplied `CF-Connecting-IP` is always overwritten for Worker requests (*needs verification*, expected).
  Source: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- *Verified* (page updated 2026-09-17): Workers AI text generation allows 300 requests/minute for models that do not require the Paid plan (all three evaluation candidates). No concurrency limit or error format is documented.
  Source: https://developers.cloudflare.com/workers-ai/platform/limits/
- *Verified* (page updated 2026-05-29): Budget alerts are informational only ("do not pause or cap usage"), account-wide across usage-based products, and available to Pay-as-you-go accounts; Free accounts without a payment method are **not mentioned**. A changelog says usage is processed once per day, so alerts arrive the day after the threshold is crossed. Per-product usage notifications require a Professional plan or higher.
  Sources: https://developers.cloudflare.com/billing/manage/budget-alerts/, https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/
- *Verified* (page updated 2026-10-12): Workers Logs is included in Workers Free (200,000 log events/day, 3-day retention), enabled with `"observability": { "enabled": true }`, and captures `console.log`.
  Source: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- *Verified* (page updated 2026-09-30): Durable Objects are available on Workers Free with the SQLite backend only (100,000 requests/day, 5 million rows read/day, 100,000 rows written/day).
  Source: https://developers.cloudflare.com/durable-objects/platform/pricing/
- *Verified* (page updated 2026-09-30): AI Gateway rate limiting applies uniformly to all requests of a gateway (no per-user scope documented). AI Gateway pricing and default logging are not stated on that page.
  Source: https://developers.cloudflare.com/ai-gateway/features/rate-limiting/
- *Partially verified*: the Workers AI pricing page points to the Workers AI dashboard for Neuron usage; a GraphQL dataset `aiInferenceAdaptive` exists, but its fields were not found.
- *Not found*: any hard spend cap for Workers AI on Workers Paid; any documented way to check Rate Limiting binding availability for an account without deploying.

## Phase 6 verification log (checked 2026-10-18)

Official documentation and local inspection only; no login, account setting, remote command, or deployment. Used by `docs/DEPLOYMENT.md`.

### Wrangler commands
- *Verified* (page updated 2026-04-21): `wrangler d1 create <NAME>` (options include `--location`, `--jurisdiction`). `wrangler d1 migrations apply <DATABASE>` accepts the database name or binding, with `--local` or `--remote`; on a remote apply Wrangler asks for confirmation and captures a backup (the prompt is skipped in non-interactive shells, the backup is not). `--env` and `--config` are global flags. `wrangler d1 export <NAME> --remote --output <file>` (also `--table`, `--no-schema`, `--no-data`). `wrangler d1 time-travel info <DATABASE> [--timestamp]` and `wrangler d1 time-travel restore <DATABASE> --timestamp <unix|RFC3339>` or `--bookmark <id>`.
  Source: https://developers.cloudflare.com/d1/wrangler-commands/
- *Verified* (page updated 2026-04-21): a Time Travel restore is **destructive**: it overwrites the database in place, cancels in-flight queries, and prints a bookmark that undoes the restore. Retention is 7 days on Workers Free and 30 days on Paid; only databases on the production backend support it (`wrangler d1 info` shows `version: production`).
  Source: https://developers.cloudflare.com/d1/reference/time-travel/
- *Verified* (page updated 2026-10-09): `wrangler deploy [<PATH>]` with `--dry-run` (compile without deploying) and `--outdir`; with the Vite plugin, `CLOUDFLARE_ENV` replaces `--env`. `--keep-vars` keeps variables changed in the dashboard; secrets are never deleted by a deployment. `wrangler rollback [<VERSION_ID>] [--name] [--message]` takes effect immediately on all routes and domains and defaults to the version before the latest. `wrangler versions list [--name] [--json]` shows the 10 most recent versions.
  Source: https://developers.cloudflare.com/workers/wrangler/commands/workers/
- *Verified* (page updated 2026-07-15): rollback is possible to the 100 most recent versions, in Wrangler or in the dashboard (Deployments → Rollback). Bound resources (such as D1) are not changed by a rollback, so old code must still work with the current schema. Whether static assets roll back with the version is **not stated**.
  Source: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/

### Environments and the build output
- *Verified* (page updated 2026-10-18): the Worker of a named environment is called `<top-level name>-<environment name>` (for example `travel-discovery-preview`).
  Source: https://developers.cloudflare.com/workers/wrangler/environments/
- *Verified* (page updated 2026-10-17): `name`, `main`, `compatibility_date`, `assets`, `workers_dev`, `preview_urls`, and `observability` are inheritable; `vars` and `d1_databases` are not; `keep_vars` is top-level only. `ai`, `ratelimits`, and `upload_source_maps` are not listed in either group (treat the bindings as non-inheritable and declare all three per environment). Variables changed in the dashboard are overwritten by the next `wrangler deploy` unless `keep_vars` is set. Wrangler looks up the directory tree for `.wrangler/deploy/config.json`, whose `configPath` redirects `wrangler deploy` to the generated configuration; how `--config` interacts with the redirect is **not stated**.
  Source: https://developers.cloudflare.com/workers/wrangler/configuration/
- *Verified locally* (2026-10-18, `@cloudflare/vite-plugin` 1.64.0, Wrangler 4.151.1): `vite build` writes the redirect to `.wrangler/deploy/config.json` (→ `dist/worker/wrangler.json`), while `vite build --config vite.admin.config.ts`, whose Vite root is `admin/`, writes it to `admin/.wrangler/deploy/config.json` (→ `dist-admin/admin_worker/wrangler.json`). **A plain `wrangler deploy` from the repository root therefore deploys only the public Worker.** The flattened top-level outputs contain no `ai`, `ratelimits`, `vars`, or `observability`, and keep `"preview_urls": false`.
- *Not documented*: the deploy command for an app built with the Vite plugin beyond `npm run build && wrangler deploy` in the getting-started guide (page updated 2026-10-12, https://developers.cloudflare.com/workers/vite-plugin/get-started/).
- *Verified locally* (2026-10-18, after adding `env.preview`, C5): `CLOUDFLARE_ENV=preview npm run build` needs no login or network and writes `name` `travel-discovery-preview` / `travel-discovery-admin-preview` with the environment's bindings, `vars`, `observability`, `workers_dev`, and `preview_urls: false`; the top-level builds differ from before only in `definedEnvironments`. `wrangler deploy --dry-run` without login: from the repository root it reports "Using redirected Wrangler configuration" (public Worker); `--config dist/worker/wrangler.json` and `--config dist-admin/admin_worker/wrangler.json` use the given file without the redirect and list the expected bindings; `--cwd admin` is refused because the redirect file is not next to a user configuration.

### Cloudflare Access for a Worker
- *Verified* (page updated 2026-10-12): dashboard path Workers & Pages → the Worker → Access → "Protect this Worker behind Access" → scope "All traffic" → authentication policy → Apply. Zero Trust must be enabled first. The setting is per Worker, so the preview and production admin Workers each need it (account-wide `all_workers` would also protect the public Worker and is not used). The quick setup offers "Cloudflare account" and "Email domain" policies; other rules are configured in Zero Trust.
  Source: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- *Verified* (page updated 2026-10-01): an Allow policy with an Include rule using the **Emails** selector and the full address admits exactly that address. Using the "Login Methods" selector with One-time PIN in an Include rule admits everyone who can receive a PIN and is a documented misconfiguration.
  Source: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- *Verified* (page updated 2026-05-06): the AUD tag is under Zero Trust → Access controls → Applications → Configure → Additional settings ("Application Audience (AUD) Tag"). The team domain has the form `https://<team-name>.cloudflareaccess.com`. The manual verification steps and key examples use RS256, which matches the verifier's RS256-only rule (ADR-004); still confirm with a real token.
  Source: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- *Observed* (2026-10-18, owner in the dashboard): the Worker Access tab offers only "Cloudflare account" and "Email domain" policies; the generated reusable policy can then be changed to an Emails Include rule under Zero Trust → Access controls → Policies. The team's public JWKS (`https://spring-dew-55d0.cloudflareaccess.com/cdn-cgi/access/certs`) returned two RSA keys with `alg` RS256, consistent with the verifier's RS256-only rule (ADR-004); acceptance of a real token is still unverified.
- *Verified* (2026-10-18, public preview Worker `travel-discovery-preview`, version `ea2abe3d`, unauthenticated `curl`): `/api/health` 200; `/api/destinations` returns the three published seed destinations in `ja`, `en`, and `es`; `/api/questions` and `/api/diagnosis-content` 200; `POST /api/ai/explanations` answers 503 `ai_unavailable` from the same origin (no model call) and 403 `forbidden` cross-origin; `/api/admin/*` 404 (GET) / 405 (POST); `DELETE` on the public API 405; SPA routes 200 with the CSP, `nosniff`, Referrer-Policy, and Permissions-Policy headers from `public/_headers`, and `Cache-Control: no-store` on the API. The owner completed the diagnosis in all three languages in a browser, saw the AI-unavailable notice, and saw a destination published in the admin console appear on the public site. Not checked: Workers Logs lines for the `disabled` outcome (dashboard).
- *Verified* (2026-10-18, public production Worker `travel-discovery`, version `87d11262`, empty database): the same unauthenticated `curl` checks as for preview pass (`/api/health` 200, empty lists in `ja`/`en`/`es`, AI 503 `ai_unavailable` same-origin and 403 cross-origin, `/api/admin/*` 404/405, `DELETE` 405, SPA routes 200 with the security headers, API `no-store`). Browser run with real content and the Workers Logs check are still open.
- **Incident (2026-10-18, admin preview)**: after Access had been enabled on `travel-discovery-admin-preview` while it had no URL, a deployment with `workers_dev: true` (version `c931cdcb`) made `https://travel-discovery-admin-preview.<account subdomain>.workers.dev` reachable **without Access**: unauthenticated `GET /`, `/destinations`, and the JS bundle returned 200 (the admin SPA, which contains no secrets or data), while `/api/admin/me` (GET, POST, and with a fake `Cf-Access-Jwt-Assertion`) returned 403 from the Worker's own JWT check. Within about two minutes the Worker was redeployed with `workers_dev: false` (version `855f6639`, "No targets deployed"), after which the URL returned 404. No admin data was exposed. Probable cause: the owner found the Worker's Access scope set to **Previews only** instead of All traffic, possibly changed when the generated policy was edited in Zero Trust (not confirmed); the owner set it back to All traffic. Later the same day the deployed `workers.dev` URL was found disabled again (404, dashboard "No URLs enabled") without a new deployment; the owner had not knowingly changed it, but had saved settings on the Access tab, which may have caused it (要確認). A redeployment (version `8bc1cc2c`) re-enabled it behind Access. Lessons: re-check the scope on the Worker's Access tab after any policy edit, verify the Access redirect with an unauthenticated request immediately after any deployment that adds a hostname, and keep the fail-closed API check.
- *Not found*: Zero Trust Free plan seat limit, price, payment-method requirement, and One-time PIN availability. The plans page (https://www.cloudflare.com/plans/zero-trust-services/) only mentions a free plan; the One-time PIN page (updated 2026-08-31) does not name plans. Confirm in the dashboard.

### Free-tier pages re-checked
- Workers limits (updated 2026-10-12): 100,000 requests/day, 10 ms CPU per request, Error 1027 when exceeded. https://developers.cloudflare.com/workers/platform/limits/
- D1 pricing (updated 2026-04-21): 5 million rows read/day, 100,000 rows written/day, 5 GB storage; queries fail until 00:00 UTC when exceeded. https://developers.cloudflare.com/d1/platform/pricing/
- Workers AI pricing (updated 2026-10-15): 10,000 Neurons/day free; on Workers Free, operations fail after that; `gemma-4-26b-a4b-it` 9,091 / 27,273 Neurons per million input / output tokens. https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers Logs (updated 2026-10-12): 200,000 events/day and 3-day retention on Free; **from 2026-12-01 Workers Logs moves to Cloudflare Observability pricing** (re-check the Free allowance before then). https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Rate Limiting binding (updated 2026-10-12): still no statement about plan availability or price. https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### Dependency and secret checks (2026-10-18)
- `npm audit`: 4 moderate findings, all the known development-only esbuild advisory through `drizzle-kit` (ADR-003, unchanged). `npm audit --omit=dev`: 0 vulnerabilities. `npm audit signatures`: 307 packages with verified registry signatures, 144 with verified attestations.
- Pattern scan of tracked files and of every added or removed line in the reachable history (cloud and GitHub tokens, private keys, JWTs, 32-hex IDs, `secret`/`password`/`api_key` assignments): one hit, the fake account ID `0123456789abcdef0123456789abcdef` in `test/node/ai-eval-runner.test.ts`. No `.env`, `.dev.vars`, `.wrangler/`, `dist/`, or `.ai-eval/` file was ever committed. Email addresses in the history: `*@example.test` test identities and `noreply@anthropic.com` (co-author lines); all 22 commits use the author and committer identity `ms <ms@macbook>`. A regular-expression scan cannot prove the absence of secrets; a dedicated scanner is part of the pre-public checklist (`docs/PUBLIC_RELEASE.md`).
---

## Phase 7 verification log (2026-10-19 to 2026-10-24)

Official documentation, local tests, unauthenticated `curl` requests, and observations reported by the owner from the dashboard; no Wrangler remote command or deployment.

- *Verified* (page updated 2026-10-12): Worker-level Access protects every hostname of the Worker, including `workers.dev` and previews, with the scope "Previews only" or "All traffic". The page says nothing about Access settings changing or disabling the `workers.dev` route, so the disabled URL seen on 2026-10-18 ("Phase 6 verification log", Incident) remains unexplained (要確認).
  Source: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- *Verified* (page updated 2026-09-22): the `workers.dev` route is disabled in the dashboard (Settings → Domains & Routes → Disable) or with `"workers_dev": false`; a dashboard change is reverted by the next `wrangler deploy` unless the configuration says the same. `workers_dev` is inferred as `false` only when the configuration has `routes` and no `workers_dev` (not the case here: every deployment environment sets it explicitly). No automatic disabling is documented.
  Source: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- *Verified* (changelog 2026-09-01; D1 debugging page updated 2026-08-11): since 2026-09-01, D1 queries on Workers Free fail once **the account** exceeds its daily row read or row write allowance, until 00:00 UTC; stored data is unaffected and Cloudflare sends an email. The binding throws an `Error` whose message starts with the `D1_ERROR` prefix; the documented texts say the account "has exceeded D1's free tier daily row read limit" (or "row write limit"). The limit is account-wide, so exhausting it on preview would also stop production: do not trigger it deliberately. `test/node/http-errors.test.ts` checks that these documented messages map to `503 service_unavailable` without logging the text.
  Sources: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/, https://developers.cloudflare.com/d1/observability/debug-d1/
- *Verified* (page updated 2026-10-12): the Workers Free limit of 100,000 requests/day applies **per account** (shared by all four Workers).
  Source: https://developers.cloudflare.com/workers/platform/limits/
- *Verified* (page updated 2026-10-15): from 2026-12-01 Workers Logs uses Cloudflare Observability pricing. Free: 0.5 GB of ingestion per day, 7-day retention, no additional ingestion; when the daily limit is reached, ingestion stops until 00:00 UTC and nothing is charged. Paid: 50 GB ingestion and 10 GB-month storage included, then $0.25/GB and $0.10/GB-month. The allowance is measured in GB, not events; the volume this app produces per day is not measured yet (要確認 in the dashboard). `head_sampling_rate` (0–1, default 1) in `observability` reduces volume per environment.
  Sources: https://developers.cloudflare.com/observability/pricing/, https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- *Observed* (owner, reported 2026-10-24): `ADMIN_RATE_LIMITER` refuses requests on the deployed `travel-discovery-admin-preview`: 150 sequential `GET /api/admin/me` calls from the signed-in admin UI returned 122 × 200 and then 28 × 429. Two requests above the limit of 120 passed, consistent with the documented eventually consistent counters.
- *Observed* (owner, reported 2026-10-24): with AI disabled, the AI toggle on the public preview site showed the unavailable notice, and the Workers Logs invocation event for `POST /api/ai/explanations` recorded status 503. The app's own line for the same request ID has `event: "ai_explanation"`, `outcome: "disabled"`, the model, `latencyMs: 0`, and `destinationCount: 0`; its `$workers.event.request` holds only the method, URL, and path, so the app line contains no address, header, or answer.
- **Privacy finding** (owner, reported 2026-10-24): the automatic Workers Logs invocation event of the public Worker stores the full request, including `cf-connecting-ip`, `x-real-ip`, `user-agent`, and the `cf` geolocation fields (city, postal code, latitude, longitude, ASN), for the retention period. This contradicts the intent of ADR-026 B (no addresses in logs), which so far only covered the app's own log lines. The Workers Logs page (updated 2026-10-12) documents `"observability": { "logs": { "invocation_logs": false } }` to disable invocation events while keeping `console.log` lines; the option is in the schema of the installed Wrangler 4.151.1. No redaction of headers is documented. **Decision (owner, 2026-10-24)**: disable invocation logs in every deployment environment of both Workers (`"logs": { "enabled": true, "invocation_logs": false }` in `wrangler.jsonc` and `wrangler.admin.jsonc`); the app's own lines (`api_error`, `ai_explanation`) remain. It takes effect with the next deployment of each Worker; events already stored expire with the retention period. Per-request status codes are then no longer in Workers Logs; the dashboard metrics still show requests with invocation logs disabled (owner, preview, 2026-10-24). Whether the admin Worker's invocation events contained the `Cf-Access-Jwt-Assertion` header or the Access cookie was not checked.
  Source: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- *Observed* (owner's audit log of 2026-10-18, reviewed 2026-10-24): every "Update Worker Script Subdomain" entry has the actor context OAuth and directly follows a Wrangler upload or deployment; there is no subdomain change from the dashboard, and the two "Update an Access application" entries are not followed by a subdomain change until the next deployment. The disabled admin preview URL was therefore most probably set by a deployment, not by saving Access settings; this was not reproduced, and an internal change that the audit log does not record cannot be ruled out. The post-deployment check in `docs/DEPLOYMENT.md` 3.4 step 5 stays.
- *Owner change* (before 2026-10-24): the account's `workers.dev` subdomain was changed because the previous one contained part of the owner's email address. Checked 2026-10-24 with unauthenticated `curl` on the new subdomain: `/`, `/destinations`, and `/api/admin/me` of both admin Workers redirect (302) to the Access login; `/` and `/api/health` of both public Workers return 200; the previous subdomain no longer resolves.
- *Observed* (owner, reported 2026-10-24): the only identity provider in Zero Trust is "Cloudflare" (Cloudflare account login); no One-time PIN. Checking that an address outside the Emails policy is refused therefore needs a second Cloudflare account (要確認; the owner decides whether to create one).
- *Verified* (2026-10-24, owner-approved redeployments of commit `2cbbdb3` with invocation logs disabled): preview public `travel-discovery-preview` (version `def4b576`) and admin `travel-discovery-admin-preview` (`e45a9449`), then production public `travel-discovery` (`f73d57c0`) and admin `travel-discovery-admin` (`07a234a3`). After each public deployment the unauthenticated `curl` checks of the Phase 6 log passed (health, `ja`/`en`/`es` content, AI 503 same-origin and 403 cross-origin, `/api/admin/*` 404, `DELETE` 405, security headers); production content is still empty. After each admin deployment, `/`, `/destinations`, `/api/admin/me`, and a JS asset path redirected (302) to the Access login immediately and every 10 s for two minutes. On preview the owner then confirmed in the dashboard that the app's `disabled` line is still recorded, that no new invocation event (`cf-worker-event`) with request details appears, that the Worker metrics still show the requests, and that the signed-in admin UI works.
- *Reported by the owner* (2026-10-19): the CI runs on GitHub for the commits pushed up to `e0bf86c` passed (ADR-027).

## ADR-001: SPA and hosting
- Status: **Accepted** (Phase 0)
- Decision: The public app is a React + TypeScript + Vite SPA, deployed as one Cloudflare Worker with static assets via `@cloudflare/vite-plugin`. The admin console is a separate Worker (ADR-004); this ADR covers the public Worker. API routes live under `/api/*` and are the only paths that invoke the Worker (`run_worker_first: ["/api/*"]`); everything else is served as static assets with SPA fallback.
- Rationale: One deployment surface; static asset requests are free and do not consume Worker invocations.
- Verified locally: `vite` dev server serves the SPA and `/api/health` from the Workers runtime; `vite preview` serves the production build with SPA fallback for deep links.
- Alternatives: Cloudflare Pages (not chosen; the current React guide targets Workers), React Router framework mode (not needed without SSR).
- `compatibility_date` is set to `2026-10-12` to match the installed workerd runtime. Update intentionally, not automatically.

## ADR-002: Database
- Status: **Accepted; implemented locally in Phase 1** (no remote database exists yet)
- Decision: Cloudflare D1, local simulation for development (default), separate preview and production databases.
- Rationale: Relational content data; Free-plan limits (500 MB/database, 5M reads/day, 100k writes/day, 50 queries/invocation) comfortably fit a content-driven app with no user data. The 50-queries-per-invocation limit means public endpoints must load content in a small number of batched queries.
- Local workflow (verified 2026-10-17): `wrangler d1 migrations apply travel-discovery --local` and `wrangler d1 execute travel-discovery --local --file db/seed/dev.sql` work without a Cloudflare login. Commands: `docs/DEVELOPMENT.md` "Database".
- *Verified locally*: D1 enforces the schema's foreign keys and CHECK constraints, and a `db.batch()` that fails leaves no partial rows (`test/workers/admin-crud.test.ts`).
- *Verified locally*: D1 rejects long `UNION ALL` chains ("too many terms in compound SELECT"); the seed uses multi-row `VALUES` instead.
- Open items: remote database creation, preview/production separation, and backup/export procedure (need owner approval; Phase 5/6).

## ADR-003: ORM and validation
- Status: **Accepted by the owner (2026-10-17); implemented in Phase 1** with `drizzle-orm ^0.45.4`, `drizzle-kit ^0.31.11`, `zod 4.6.7` (as specified in `package.json`). The 1.0 RC is explicitly not adopted.
- Decision: **Drizzle ORM 0.45.x (latest stable, 0.45.4 on 2026-10-17) with drizzle-kit 0.31.x**, plus Zod for API input and AI output validation. `package.json` uses `^0.45.4` and `^0.31.11`. For 0.x versions a caret range does not cross the minor version, so these allow only 0.45.x (`>=0.45.4 <0.46.0`) and 0.31.x (`>=0.31.11 <0.32.0`); a 1.0 release or pre-release cannot be installed through `npm update`.
- Migration flow: write the schema in TypeScript → `drizzle-kit generate` produces SQL → review the SQL → apply with `wrangler d1 migrations apply` (local first, remote only with approval). Wrangler remains the single tool that applies migrations; drizzle-kit never pushes directly to a remote database.
- Rationale: typed schema and queries with plain SQL migrations that can be reviewed; stable release per CLAUDE.md. Wrangler's `migrations_pattern` supports Drizzle's nested output layout if needed.
- Risks: Drizzle's D1 guide now installs the 1.0 RC (`@rc`) and promotes a v1.0 upgrade, so examples in current docs may not match 0.45 APIs exactly; a later 1.0 migration is expected. Phase 1 must re-check the 0.45 docs for the D1 driver import (`drizzle-orm/d1`) and the drizzle-kit config before writing code.
- Alternatives: Drizzle 1.0 RC (rejected for now: pre-release); no ORM with hand-written SQL and Zod-validated rows (viable fallback if Drizzle 0.45 turns out to be awkward with D1).
- Implementation notes (Phase 1):
  - `drizzle-kit generate` (0.31) writes flat `migrations/0000_<name>.sql` files plus `migrations/meta/*.json` snapshots; Wrangler applies the `.sql` files directly. Commit both.
  - Aggregate writes use `db.batch()` (atomic in D1) and reference new rows by slug sub-selects, so creates need no intermediate reads.
  - *Known advisory (investigated 2026-10-17)*: `npm audit` reports 4 moderate findings that are one advisory, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (CVSS 5.3): esbuild `<= 0.24.2` serve mode (dev server) sends `Access-Control-Allow-Origin: *`, so a malicious website can read responses from a running esbuild dev server; fixed in esbuild 0.25.0. The other three findings are the dependents in the chain.
    - Path: `drizzle-kit@0.31.11` (direct devDependency) → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`. Both `@esbuild-kit` packages are deprecated on npm ("Merged into tsx").
    - Scope: development only. `npm audit --omit=dev` reports 0 vulnerabilities, and the production bundles do not contain these packages.
    - Usage: drizzle-kit 0.31.11's shipped code (`bin.cjs`, `api.*`, `index.*`, `utils.*`) contains no reference to `@esbuild-kit`; it is only declared in `package.json`. drizzle-kit loads its own `esbuild` 0.25.12, which is outside the affected range. Nothing in this project starts an esbuild dev server from the 0.18.20 copy.
    - Fix availability: 0.31.11 is the latest stable drizzle-kit and still declares the dependency. The 1.0 pre-releases (`1.0.0-rc.4`, `1.0.0-beta.22`) no longer declare it, but the owner chose not to adopt 1.0 pre-releases. `npm audit fix --force` would *downgrade* to drizzle-kit 0.18.1 (breaking). Replacing the package with `overrides` was not done (untested compatibility; owner instruction).
    - Decision: keep as a held development-only transitive dependency. The risk is low but not zero: it would matter if a tool or script started an esbuild dev server from that copy. Re-evaluate when drizzle-kit is upgraded, when dependencies or their usage change, or when a stable drizzle-kit drops `@esbuild-kit`.

## ADR-004: Admin authorization
- Status: **Accepted by the owner (2026-10-17); implemented locally in Phase 1** (no Access application or deployment exists yet). See "Admin protection re-evaluation" for the comparison and "Admin authentication status" for what is implemented, tested, and deploy-only.
- Decision: **a separate admin Worker, entirely protected by Worker-level Cloudflare Access ("All traffic")**, with JWT validation inside every admin API handler. The public Worker has no admin editing functions. The admin Worker initially uses its `workers.dev` hostname; a Custom Domain on a subdomain of an owner zone is **deferred** by the owner.
- Identity provider: Cloudflare Zero Trust Free is the candidate. Available login methods (including One-time PIN), seat limits, and pricing terms are confirmed in the dashboard at setup time, not assumed here.
- Invariants:
  1. The public Worker contains no admin API routes and no admin data-mutation code, so no URL of the public Worker can reach admin functions.
  2. Every admin API request is authorized inside the Worker by validating the `Cf-Access-Jwt-Assertion` JWT with `jose` (signature via the team JWKS, `RS256` only, issuer = team domain, audience = the admin application's AUD, `exp` required and not expired, `nbf` honored if present, non-empty `email` claim). Missing header, invalid token, or missing `ACCESS_TEAM_DOMAIN`/`ACCESS_POLICY_AUD` configuration → 403 (fail closed). Edge protection alone is never trusted.
  3. All hostnames that reach admin code (workers.dev, Version URLs, routes, Custom Domains) are covered by Access, or disabled. The admin Worker sets `preview_urls: false` unless previews are explicitly needed.
  4. No hostname/path Access application with a Bypass policy may match an admin hostname (more specific apps take precedence over Worker-level Access).
  5. Tests assert that every admin endpoint returns 403 without a valid token, including tokens with the wrong audience/issuer and expired tokens.
- Local development (implemented): Access does not run locally, so `npm run dev:admin` returns 403 unless `ADMIN_DEV_IDENTITY_EMAIL` is set in the git-ignored `.dev.vars`. The resolver that reads it (`admin-worker/local-dev-identity.ts`) is passed only under `import.meta.env.DEV`, so production builds do not contain it. `scripts/verify-bundles.mjs` fails the build if the admin bundle contains the dev identity code, and a production `vite preview` with `.dev.vars` present was verified to return 403. Tests sign JWTs with locally generated RSA keys and inject them through `getKey`.
- Additional request checks (implemented): mutating admin requests (`POST/PUT/PATCH/DELETE`) with an `Origin` header different from the Worker's origin are rejected (403), and request bodies must be `application/json` (415 otherwise) and at most 64 KiB (413). Together these block cross-site form posts that would carry the Access cookie.
- *Not verified*: the signing algorithm of Access JWTs. The verifier only accepts `RS256` (hardening; JWKS keys observed in Cloudflare examples are RSA). If Access uses another algorithm, every admin request fails closed with 403; confirm on the first approved deployment. *Update (2026-10-18)*: on the deployed admin preview Worker the owner signed in through Access and the admin UI loaded its data from the admin API, so real Access tokens validate with the RS256-only verifier; the team JWKS lists RS256 keys only ("Phase 6 verification log").
- C (homemade password/session auth) remains **rejected** per CLAUDE.md.

## ADR-005: AI provider
- Status: Proposed (implementation in Phase 4)
- Decision: Cloudflare Workers AI through the `AI` binding, behind a small `RecommendationExplanationProvider` interface.
- Facts: 10,000 Neurons/day free; operations fail on the Free plan after the allocation is used (no surprise bills on Free). Local development calls the real remote service and counts toward usage and rate limits.
- Phase 4 must confirm: model choice and terms, JSON/structured output support, per-request token limits, and a server-side daily request budget so one user cannot exhaust the shared allocation.
- No AI binding is configured in Phase 0.
- *Update (2026-10-18)*: the Phase 4 design, the model shortlist, and how the daily budget is handled are in ADR-026 (Proposed). The model is not chosen yet.

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
- **Resolved in ADR-022**: the locale is not in the URL; the choice is persisted in `localStorage`, with browser-language detection on first visit. (Before Phase 3 the locale was in-memory only and defaulted to `ja` on every load.) Phase 1/2 APIs must therefore accept the locale as an explicit, validated parameter rather than inferring it from the URL path, so either routing choice remains possible.

## ADR-013: Toolchain and package manager
- Status: **Accepted** (Phase 0)
- Decision: npm with committed `package-lock.json`; Node `>=22.22.0` (`.nvmrc` pins 24 for local development). TypeScript 6.0 with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`, split into `tsconfig.app.json` (browser), `tsconfig.worker.json` (Workers types), and `tsconfig.node.json` (config files). ESLint 10 flat config with `typescript-eslint` `strictTypeChecked`, React Hooks, and React Refresh rules. Vitest 5 with Node by default and jsdom per file.
- Rationale: npm ships with Node, needs no extra install, and is what Cloudflare's guides show first. TypeScript 7 is postponed until `typescript-eslint` supports it.
- No `deploy` script is defined, to avoid accidental deployment. Deployment commands will be added in Phase 5/6 with approval.

## ADR-014: UI styling stack
- Status: **Accepted** (Phase 3b, 2026-10-17; owner approved Tailwind after a compatibility check and asked to hold Motion and decide shadcn/ui by need)
- Decision: Tailwind CSS 4 (`tailwindcss` and `@tailwindcss/vite` 4.3.3, dev dependencies) for the public SPA only. The admin SPA keeps its hand-written stylesheet. Design tokens (colors, font stack, one enter animation) are CSS variables in `src/styles.css` `@theme`; dark colors switch with `prefers-color-scheme`. Shared class strings live in `src/components/classes.ts`.
  - *Verified* (2026-10-17): the official Vite guide installs `tailwindcss` and `@tailwindcss/vite`, adds `tailwindcss()` to the Vite plugins, and uses `@import "tailwindcss"` (https://tailwindcss.com/docs/installation/using-vite). `@tailwindcss/vite` 4.3.3 (released 2026-07-16) declares `vite: ^5.2.0 || ^6 || ^7 || ^8`. Installing it added no packages with install scripts under `strict-allow-scripts` (ADR-016); native binaries come from platform optional dependencies.
  - Tailwind generates one static CSS file at build time, so the strict CSP (`style-src 'self'`, ADR-017) is unchanged. React sets the two dynamic widths (progress and fit bars) through the CSSOM, which CSP does not block (checked in the browser with `vite preview`).
- shadcn/ui: **not adopted**. The public UI needs buttons, form fields, choice lists, a progress bar, and disclosure sections; native elements (`button`, `input`, `fieldset`, `details`) cover these accessibly without Radix dependencies. Revisit if a complex widget (dialog, combobox) becomes necessary.
- Motion: **not adopted**. Question transitions use a 180 ms CSS animation (`motion-safe:animate-enter`) that never blocks input; all animations and transitions are reduced to near zero under `prefers-reduced-motion`. Revisit only for a concrete need CSS cannot meet.

## ADR-015: Start on Workers Free and fail gracefully at limits
- Status: **Accepted by the owner (2026-10-17)**
- Decision: Launch the MVP on the Workers Free plan. Exceeding a Free limit produces errors, not charges (verified for Workers requests, D1 daily reads/writes, and Workers AI Neurons; see verification log). When AI or any external service fails, the core diagnostic keeps working wherever possible.
- API error contract (all Workers): JSON body `{ "error": "<stable_code>" }`. Validation failures (400) may add `"issues": [{ "path": "<field path>", "code": "<issue code>" }]` so the admin UI can show localized field errors; issue codes are Zod issue codes or the stable custom codes in `server/admin/validation.ts`. No stack traces, SQL, provider messages, binding names, or internal IDs are ever returned; details go to controlled server logs without request bodies or answers. Codes are defined once in `shared/api-errors.ts`.

  | Status | When | Example code |
  |---|---|---|
  | 400 | Malformed or schema-invalid input (Zod) | `invalid_request` |
  | 403 | Admin request without a valid Access JWT (missing, bad signature/issuer/audience, expired, or auth config missing) | `forbidden` |
  | 404 | Unknown route or unpublished/missing resource | `not_found` |
  | 405 | Method not allowed (with `Allow` header) | `method_not_allowed` |
  | 409 | Admin write conflicts (duplicate slug or other unique value); AI explanation request whose answers no longer match published content (ADR-026, proposed) | `conflict` |
  | 413 | Request body over the size limit (64 KiB) | `payload_too_large` |
  | 415 | Mutation body that is not `application/json` | `unsupported_media_type` |
  | 429 | App-level rate limit exceeded (AI/admin endpoints) | `rate_limited` |
  | 503 | Dependency unavailable: D1 errors including daily limits, AI unavailable/over quota/timeout | `service_unavailable`, `ai_unavailable` |
  | 500 | Unexpected bug (caught by a top-level handler) | `internal_error` |

  Implemented in Phase 1 (`server/http/errors.ts`, tested in `test/workers/`): 400, 403, 404, 405, 409, 413, 415, 503 (D1/SQLite errors), 500. Phase 4 Stage 2 (ADR-026) adds `ai_unavailable` to `shared/api-errors.ts` and uses 403, 409, 429, and 503 `ai_unavailable` on `POST /api/ai/explanations` (tested in `test/workers/ai-explanations.test.ts`). Phase 5d: the admin API answers unsupported methods on existing paths with 405 and `Allow` (derived from the registered routes, only after authorization) and uses 429 for its optional per-identity limiter (ADR-020; `test/workers/admin-limits.test.ts`).
  - *Documented, not observed* (2026-10-19, "Phase 7 verification log"): D1 daily-limit errors are thrown with the `D1_ERROR` prefix, so the mapper, which treats any error whose message chain contains `D1_` or `SQLITE_` as 503 and everything else as 500, answers them with 503 (`test/node/http-errors.test.ts`). A real limit error has not been seen; the limit is account-wide and must not be triggered on purpose.
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
- Phase 1 dependency additions (`drizzle-orm`, `drizzle-kit`, `zod`, `hono`, `jose`, `@cloudflare/vitest-plugin`) installed under strict mode with no new install scripts. `drizzle-kit` brings additional `esbuild` versions (0.25, 0.18); the name-only `esbuild` deny covers them.
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
- *Update (2026-10-18, Phase 5c)*: destination images are rendered with `referrerPolicy="no-referrer"`, so third-party image hosts do not receive the page URL; they still see the visitor's IP address (data flow in `docs/ARCHITECTURE.md` §8).

## ADR-018: Shared D1 database for the public and admin Workers
- Status: **Accepted by the owner (2026-10-17); implemented locally in Phase 1.**
- **Important limitation: the public Worker's "read-only" status is a constraint enforced by code structure, lint rules, and tests. It is NOT a database-level read-only permission.** D1 offers no read-only binding, so the public Worker's binding can technically execute writes; the controls below only make an accidental or unreviewed write path fail review/CI.
- Facts (checked 2026-10-17):
  - *Not found in docs*: any read-only D1 binding or per-binding permission. A Worker with a D1 binding can run any SQL statement. Account roles and API tokens (e.g. read-only roles for the `/query` REST API) restrict people and tokens, not Worker bindings.
    Sources: https://developers.cloudflare.com/d1/worker-api/, https://developers.cloudflare.com/workers/authorization/
  - *Verified*: `PRAGMA query_only` is **not** in D1's list of supported PRAGMAs, and D1 PRAGMAs apply only to the current transaction, so it cannot be used as a read-only guard.
    Source: https://developers.cloudflare.com/d1/sql-api/sql-statements/
  - *Verified*: Service bindings let one Worker call another without a public URL (RPC via `WorkerEntrypoint`); Access context is not propagated across them.
    Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
  - *Not explicitly documented*: binding the same `database_id` from two deployed Workers. Expected to be supported; confirm when the remote database is created (requires approval). *Verified (2026-10-18)*: the deployed `travel-discovery-admin-preview` and `travel-discovery-preview` both bind `travel-discovery-preview`; a destination published in the admin console appeared on the public site.
  - *Verified locally (2026-10-17)*: without a `database_id`, Wrangler keys local D1 state per binding, so `PUBLIC_DB` and `ADMIN_DB` saw **different** local databases. With the same `database_id` in both configs they share one local database. Both configs therefore use the local-only placeholder `database_id: "local-travel-discovery"`, to be replaced with the real ID only after the owner approves creating the database. A deploy with the placeholder would fail rather than touch another database.
- Configuration design:
  - One D1 database per environment (local, preview, production). Both `wrangler` configs bind it by the same `database_id`; binding names differ (`PUBLIC_DB` in the public Worker, `ADMIN_DB` in the admin Worker) so code cannot be copy-pasted across the boundary unnoticed.
  - **Only the admin Worker's config owns migrations** (`migrations_dir`); the public config binds the database without migration settings. Migrations are applied only through the admin config, locally first and remotely only with owner approval.
  - Local development runs two Vite dev servers (public on 5173, admin on 5174). The admin Vite config sets `persistState.path` to the project's `.wrangler/state` (its Vite root is `admin/`) and `inspectorPort: 9230` (the public server uses 9229). *Verified locally*: a destination published through the admin dev server is immediately returned by the public dev server.
- Write prevention on the public side (code-level controls only, because the platform offers no read-only binding):
  1. Code layout (implemented): `worker/` (public Worker), `server/public/` (published-content reads), `admin-worker/` and `server/admin/` (admin-only: validation, reads, writes, auth). Shared code is limited to `server/db/`, `server/http/`, `server/localization.ts`, and `shared/`.
  2. ESLint `no-restricted-imports` (implemented) forbids `worker/`, `server/public/`, `server/http/`, and `server/db/` from importing `server/admin/` or `admin-worker/`, and forbids both SPAs from importing server code. `test/node/boundary.test.ts` walks the public Worker's import graph and fails on any admin module or write query (`.insert/.update/.delete/.batch/.exec` or write SQL); it was checked to fail on static, side-effect, re-export, and dynamic imports of admin code. `scripts/verify-bundles.mjs` also fails the build if the public bundle contains `/api/admin`, `ADMIN_DB`, or Access JWT code.
  3. The public Worker exposes only `GET`/`HEAD` routes; any other method returns `405`. *Proposed amendment (ADR-026)*: one exception, `POST /api/ai/explanations`, which reads published content but never writes; every other route and method keeps returning `405`. All queries are parameterized (Drizzle), and public endpoints never accept SQL fragments, column names, or sort expressions from clients except from fixed allowlists.
  4. Public queries filter `status = 'published'` and select explicit columns only.
- Residual risk (accepted for MVP): these controls do not stop a bug that slips past review, or a compromised dependency running inside the public Worker, from writing through its binding. Stronger isolation option, if needed later: remove the D1 binding from the public Worker and read through a service binding to a private, read-only "content" Worker with no public URL. Not chosen now because it adds a third Worker and more invocations for little MVP benefit.

## ADR-019: HTTP routing in Workers (Hono)
- Status: **Accepted** (Phase 1)
- Decision: Use Hono 4 for routing in both Workers (`worker/index.ts`, `admin-worker/app.ts`).
- Rationale: about 20 admin routes need shared middleware (authorization, error mapping); Hono is small, Workers-native, has no install scripts, and exposes its route table (`app.routes`), which the authorization test uses to cover every registered admin route automatically.
- Alternatives: hand-written `fetch` routing (more code for the same behavior).

## ADR-020: Phase 1 content and admin API rules
- Status: **Accepted** (Phase 1 implementation decisions within the existing spec; see `docs/DATA_MODEL.md` "Phase 1 schema notes" for schema-level details)
- Publication: a destination or question can be `published` only if it has a `ja` or `en` translation (every fallback chain in ADR-012 then resolves). Published questions need at least two options, each with a `ja` or `en` label. Draft content may have any subset of translations.
- Question types (*superseded by ADR-021: multiple choice is now publishable*): `multiple_choice` questions can be saved as drafts but **cannot be published** until Phase 2 defines and tests their scoring semantics (SPEC §4: "Multiple choice only if scoring semantics are clearly defined"). The server rejects it with issue code `question_type_not_publishable` (`server/admin/validation.ts`), and the admin UI applies the same rule before submitting (`admin/src/questionRules.ts`). The database CHECK constraint still allows the type, so lifting the rule needs no migration.
- Deactivation is soft: content uses `status = 'archived'`; taxonomy (countries have no status; attributes and categories use `active/archived`). Question options omitted from an update are archived, keeping their IDs, translations and effects, and are reactivated if listed again.
- Aggregates are replaced by `PUT` (base row + translations + child rows in one atomic batch). No optimistic concurrency check in MVP (single owner); concurrent edits are last-write-wins.
- Public API: `GET /api/destinations`, `GET /api/destinations/:slug`, `GET /api/questions`, each with an optional validated `locale` (`ja` default). Responses include the locale actually used for each translated object. Path slugs are checked against the shared slug format (`shared/slug.ts`, also used by admin validation) and malformed or overlong slugs return 404 without a D1 read. Scoring data (attribute scores, option effects, priority weights) is not exposed; Phase 2 decides where scoring runs.
- Admin lists are paginated (50 per page) with `q`, `status`, and (questions) `categoryId` filters.
- Settings: single key `quiz` with `minQuestions`, `targetQuestions`, `maxQuestions` (1–30, min ≤ target ≤ max) and `resultCount` (3–5); defaults 6 / 10 / 12 / 5 when unset (SPEC §4, §6). The default `resultCount` of 5 is an implementation choice within the 3–5 range.
- Not implemented in Phase 1: preview-before-publish beyond the draft status (SPEC §10 says "where practical"), `range` question type (see DATA_MODEL notes).
- **Deferred to Phase 5: rate limiting for admin endpoints** (SPEC §13 asks for reasonable limits on AI and admin endpoints). Reason: every admin URL is behind Cloudflare Access for a single owner, so unauthenticated traffic is stopped at the edge and authenticated traffic is limited to the owner's own use; the remaining risk (a compromised owner session or a runaway client) is better handled together with the AI endpoint limits. Revisit during the Phase 5 security review (`prompts/05-polish-and-e2e.md` "Review API validation, error leakage, rate limits"), or earlier if admin access is extended beyond the owner or the admin API is exposed without Access.
  - *Implemented 2026-10-18 (Phase 5d, owner option (a))*: after the Access JWT check, the admin API consults an optional Rate Limiting binding `ADMIN_RATE_LIMITER` keyed by `admin:<Access email>` and answers `429 rate_limited` when it refuses; unauthenticated requests are rejected with 403 before the limiter is consulted. The binding is configured only with the deployment environments (ADR-026 C5); a suggested starting limit is 120 requests per 60 s per identity. Without the binding no limit applies, which is acceptable while Access restricts the admin Worker to the owner. Tests: `test/workers/admin-limits.test.ts`.

## ADR-021: Phase 2 diagnostic engine, costs, and seasons
- Status: **Accepted** (owner-approved 2026-10-17)
- Engine: pure TypeScript in `domain/diagnosis/`, specified in `docs/DIAGNOSTIC_ALGORITHM.md` (formula, multiple-choice averaging, selection weights, seeded draw, stopping rule, tie-breaking, budget/season/duration rules). The domain may import only `shared/` constants; ESLint and `test/node/boundary.test.ts` enforce this.
- Where the engine runs: decided in ADR-022 (browser). The module works in both environments.
- Multiple choice: contributions are averaged over the selected options, counting undefined effects as 0. `multiple_choice` questions can now be published (lifts the ADR-020 restriction).
- Question selection is deliberately simple: priority × category balance × novelty, drawn with a per-step seeded PRNG. Discrimination-based selection and stability-based early stopping are deferred until content volume can validate them (thresholds in the algorithm document).
- Costs: moved to `destination_cost_estimates` (at most one estimate per destination and currency; amount range, `period` `per_day`/`per_trip`, scope, source, update date) with `destination_cost_estimate_translations` for the per-locale basis. Supported currencies: `JPY`, `USD`, `EUR` (`shared/costs.ts`), default `JPY`.
  - Alternatives: keep one estimate per destination and add a period column (smaller change, but users with a different budget currency could never be compared, and moving to multiple estimates later would need a data migration). Chosen now because no cost data exists yet.
- Budget comparison: same currency and `per_person_excluding_international_flights` scope only; no exchange-rate conversion. Only destinations whose lowest plausible cost exceeds the budget upper limit are excluded; missing or incomparable data is kept and flagged. Budget never affects the fit score.
- Seasons: structured best months stored as a 12-bit mask `destinations.best_months_mask` (bit `m − 1` = month `m`, `NULL` = unknown). Season and trip duration are annotations only; they do not exclude or reorder destinations. `best_season_text` remains as authored guidance.
- Fallback explanation: structured data from the engine (top contributing attributes, statuses) rendered with message-catalog templates and the destination's authored text. No new database field.
- `range` question type: not added. The only bounded numeric input (budget) is a trip constraint, not a quiz question.
- Migration `0001`: rebuilds `destinations` to drop the legacy cost columns and their CHECK constraint. Because D1 enforces foreign keys during migrations, dropping the old table would cascade-delete destination translations and attribute scores, so the migration copies those rows to temporary tables and restores them. Legacy single-currency cost values are discarded (no production database exists; local data must be re-entered). Covered by `test/workers/migration.test.ts`.

## ADR-022: Client-side diagnosis, diagnosis content endpoint, locale preference
- Status: **Accepted** (owner-approved 2026-10-17; Phase 3)
- Scoring location: the browser runs question selection, scoring, and ranking with `domain/diagnosis/` on a content snapshot from `GET /api/diagnosis-content`. Answers, trip constraints, and quiz progress are never sent to or stored on the server.
  - *Proposed amendment (ADR-026)*: when the user turns AI assistance on, the answers and constraints are sent once to the public Worker for the explanation request and are not stored. With AI off, nothing changes.
  - Rationale: one Worker invocation per quiz session (Workers Free, ADR-015), no answers leave the browser, and the public Worker stays `GET`/`HEAD` only (ADR-018).
  - Trade-off: attribute scores and option weights become public. They are content, not secrets, and the repository is intended to become public. A user can only tamper with their own results, which are not shared or stored.
  - Phase 4 constraint: the AI explanation endpoint must not trust client-supplied rankings. It validates the submitted answers and constraints, recomputes the ranking server-side with the same domain module and current published content, and explains only those destinations. That endpoint requires revisiting ADR-018 (first non-`GET` public route) at that time.
- `GET /api/diagnosis-content?locale=ja|en|es`:
  - Returns only published questions in active categories with their active options, effects on active attributes only, active attributes, published destinations, and the validated quiz settings (defaults when unset or invalid). No internal IDs, statuses, or timestamps other than cost `updatedAt`.
  - Missing `locale` means `ja`; any other value returns `400 invalid_request` (same rule as the other public endpoints). Translated text follows ADR-012's fallback chain; each translated object reports the locale actually used. Content without any translation in the chain is omitted.
  - Response shape is defined once in `shared/diagnosis-content.ts` (Zod) and validated by the client, so non-JSON or unexpected responses (for example the platform's Error 1027 page) become a localized "temporarily unavailable" state.
  - Caching: the response is `Cache-Control: no-store`, so a reload always sees the latest published content. The client keeps one snapshot in memory for up to 5 minutes and reuses it for "restart"; a quiz in progress keeps its snapshot so selection and ranking stay consistent. Admin changes are therefore visible to a new page load immediately and to an already open page within 5 minutes.
- Locale preference: not part of the URL. On load: a stored preference (`localStorage` key `travel-discovery.locale`) if it is a supported locale; otherwise the first supported primary language in `navigator.languages` (for example `es-MX` → `es`); otherwise `ja`. Changing the language stores the choice. Only this UI preference is stored; storage errors (private mode, disabled storage) are ignored. Invalid stored values are ignored. Content fallback follows ADR-012; UI strings are complete in every locale (compile-time check). Changing the language during a quiz reloads the content snapshot in the new locale and keeps the answers, which are keyed by stable slugs.
- Quiz state: in memory only (React state). A reload restarts the quiz. Nothing is written to `localStorage`, `sessionStorage`, cookies, or the server. Changing an earlier answer discards the later answers, because later questions depend on earlier answers (`docs/DIAGNOSTIC_ALGORITHM.md` §7). Restart draws a new seed with `crypto.getRandomValues`.
- AI toggle (Phase 3): visible, default OFF, stored only in the in-memory quiz state. *Updated in Phase 4 (ADR-026)*: when ON, the results page sends one AI explanation request and shows AI notes or a non-blocking notice next to the deterministic explanation; when OFF, no request is made.

## ADR-023: Lightweight validation in the public bundle (`zod/mini`)
- Status: **Accepted** (Phase 3b)
- Decision: Schemas bundled into the public SPA (`shared/diagnosis-content.ts`, `shared/quiz-settings.ts`) use `zod/mini` (same `zod` 4.6 package, functional API). Server-only schemas keep the regular `zod` API; regular schemas may embed `zod/mini` schemas (both are built on Zod's core), which the admin settings tests cover.
- Measured public JS bundle (gzip): 116.4 kB before Phase 3a, 150.3 kB with regular `zod` in the client, 132.7 kB with `zod/mini`.
- Alternative: a hand-written validator (smaller, but duplicates the contract and loses shared types).

## ADR-024: Outbound flight and hotel search links
- Status: **Accepted** (Phase 3c, 2026-10-17; owner set the candidates Google Flights or Skyscanner, and Booking.com, prefilling only when safe and reliable, and no affiliate IDs)
- Decision: link to the providers' start pages without search parameters: Google Flights `https://www.google.com/travel/flights` and Booking.com `https://www.booking.com/`. The URLs are fixed constants in `src/diagnosis/searchLinks.ts`; no user input, answers, constraints, or destination data is added to them. Links open in a new tab with `rel="noopener noreferrer"`, say so in their accessible name, and are labelled as external sites whose prices differ from our indicative costs. The results card shows the destination and country name next to the links so the user can type them into the provider's search.
- Why no prefilled search (checked 2026-10-17):
  - Skyscanner documents referral links with named parameters (`origin`, `destination`, `outboundDate`, Stays `entity_id`/`checkin`/`checkout`) only as part of its affiliate programme: the endpoint `https://skyscanner.net/g/referrals/v1/{vertical}/{pagetype}` takes an Impact `mediaPartnerId` and tracking parameters, and the docs do not say it may be used without them. Our destinations also have no IATA codes or Skyscanner entity IDs.
    Sources: https://developers.skyscanner.net/docs/referrals/overview, https://developers.skyscanner.net/docs/referrals/examples
  - Google Flights: no official documentation of its URL parameters was found; the `q` free-text parameter is described only by third parties.
  - Booking.com: official developer documentation shows search URLs only as returned by its affiliate (Demand) API with an `aid`; the public `searchresults.html` parameters are documented only by third parties.
  - Both start pages were opened in a browser and load. Booking.com redirects to a localized page and appends its own default `aid`/`label`; the app does not add them.
- Flights provider: Google Flights rather than Skyscanner because, without prefilling, both are equivalent start pages, and Skyscanner's documented linking route is its affiliate programme. Swapping providers is a change to one constant list.
- No departure-airport input: it would only be useful for prefilled searches, so it is not collected (SPEC §5 lists it as optional).
- Revisit if a provider publishes a documented, affiliate-free deep-link format, or if the owner decides to join an affiliate programme (requires a new decision on privacy, disclosure, and SPEC §3 "no affiliate tracking").

## ADR-025: End-to-end tests with Playwright
- Status: **Accepted** (Phase 3d, 2026-10-17; owner approved Playwright and asked to confirm before any browser download)
- Decision: `@playwright/test` 1.64.1 (dev dependency; no install scripts, so it installs under `strict-allow-scripts`, ADR-016). Local runs use the installed Google Chrome through `channel: "chrome"`, so no browser binary is downloaded. Tests run against a production build in `vite preview` with an isolated, freshly seeded D1 state (`E2E_STATE_DIR`, `.wrangler/e2e/state`). Desktop and mobile (Pixel 7) projects. Details: `docs/DEVELOPMENT.md` "End-to-end tests".
  - *Verified* (https://playwright.dev/docs/browsers, 2026-10-17): installing the npm package does not install browsers; `npx playwright install` downloads them from Microsoft's CDN (a few hundred MB); `channel: "chrome"` uses an installed branded Chrome.
- Not yet decided: which browser CI uses (Phase 5). Bundled Chromium needs a download in CI; this requires the owner's approval at that time. *Update (2026-10-18)*: E2E is not part of CI for now (ADR-027).
- *Flaky tests fixed (2026-10-18, Phase 4 Stage 4)*: in `e2e/platform.spec.ts`, (1) the keyboard-only test checked for the results heading and then waited for a question input; if the last answer's navigation happened between the two, it waited 30 s for an input that no longer existed. It now waits for the next page after each answer, like `answerAllQuestions`. (2) The axe test ran while the 180 ms enter animation still had reduced opacity, so `color-contrast` could fail; `axeViolations` now waits for running animations to finish (`waitForAnimations` in `e2e/fixtures.ts`). Both were test timing races, not application faults (before the fix they failed in 0 of 3 runs on `96a5426`, 1 of 3 on `6b3d6a4`, and 3 of 4 during Stage 3; after it, 4 of 4 full runs passed).
- Admin authorization E2E is part of Phase 5 (`prompts/05-polish-and-e2e.md`). *Implemented 2026-10-18 (Phase 5b)*: `e2e/admin.spec.ts` with an admin dev server (`CLOUDFLARE_ENV=e2e`, local identity from `env.e2e` in `wrangler.admin.jsonc`) for allowed paths and the admin production build for denied paths; both share the E2E database with the public server. Details: `docs/DEVELOPMENT.md` "End-to-end tests". Allowed paths cannot use a real Access JWT locally, so token acceptance on a deployed Worker remains a deploy-only check ("Admin authentication status").

## ADR-026: AI explanation endpoint (Phase 4)
- Status: **Proposed** (Stage 1, 2026-10-18). The owner approved the overall direction; the items under "Open decisions" and each implementation stage still need approval. Facts cited below are in "Phase 4 verification log".
- Scope: AI writes a short supplementary paragraph for destinations the deterministic engine has already ranked. It never selects, orders, filters, or scores destinations, and it is not a source of facts. Everything below must keep the core diagnosis working with AI off, unavailable, or misbehaving.

### Endpoint and ADR-018 / ADR-022 amendments
- `POST /api/ai/explanations` on the **public Worker**. It is the only non-`GET`/`HEAD` route; the method guard keeps returning `405` for everything else. The handler reads published content only; the write-pattern boundary test still applies to everything it reaches.
- POST, not GET: answers must not appear in URLs (logs, history, referrers).
- With AI off, the client never calls this endpoint (ADR-006, SPEC §8). With AI on, it calls it at most once per displayed result set and locale, after the deterministic results are shown, without automatic retries.
- Request preconditions: `Origin` equal to the Worker's origin (else `403 forbidden`), `Content-Type: application/json` (else `415`), body size limit (below). Cross-origin browser requests are also blocked by CORS preflight, since no CORS headers are sent. Non-browser clients can forge `Origin`, so this is not abuse protection; rate limiting is.
- Alternative considered: a separate AI Worker (stronger isolation of the only POST route, but a third Worker with its own D1 binding, config, and deployment). Not chosen for the MVP; revisit with the ADR-018 content-Worker option.

### Request contract and limits
Defined once in `shared/ai-explanation.ts` (Stage 2); objects are strict (unknown keys rejected).

| Field | Rule | Source of the bound |
|---|---|---|
| `locale` | `ja` / `en` / `es` | `shared/locales.ts` |
| `answers` | 1–30 items; question slugs unique | 30 = `quizSettingsSchema` maximum for `maxQuestions`; at runtime also `≤ settings.maxQuestions` |
| `answers[].question` | slug, ≤ 64 chars | `shared/slug.ts` (`MAX_SLUG_LENGTH`) |
| `answers[].options` | 0–20 slugs, unique (empty = skipped) | 20 = admin maximum options per question (`server/admin/validation.ts`) |
| `constraints.days` | optional integer 1–`MAX_TRIP_DAYS` (365) | existing constant |
| `constraints.months` | optional, unique integers 1–12, ≤ 12 | `shared/months.ts` |
| `constraints.budget` | optional `{ amount: 1–MAX_BUDGET (100,000,000), currency }` | existing constants; `SUPPORTED_CURRENCIES` |
| `expected` | 1–5 unique slugs: the ranking the client displays | 5 = maximum `resultCount` |

- `MAX_TRIP_DAYS` and `MAX_BUDGET` currently live in `src/diagnosis/constraintsForm.ts`, which server code may not import (ESLint). Stage 2 moves them unchanged to `shared/` and imports them from both sides; they remain the single source of truth.
- Body size: the existing `MAX_JSON_BODY_BYTES` (64 KiB) is kept; the schema is the effective limit. Worst case allowed by the schema: one answer is at most `{"question":"<64>","options":[20 × "<64>"]}` ≈ 1,431 bytes, 30 answers ≈ 43 KB, plus constraints, `expected`, and `locale` < 1 KB, so every schema-valid body fits and the byte limit only stops oversized bodies before JSON parsing (`413`). A typical body is 1–2 KB. A smaller byte limit would require lower schema bounds than the admin allows, so it was not chosen.
- Validation order: size and media type → JSON parse → schema (`400 invalid_request`) → `answers.length ≤ settings.maxQuestions` (`400`) → recompute.

### Server-side recomputation (no trust in the client)
1. Load published content with the same read path as `GET /api/diagnosis-content` and map it with the same mapping the browser uses (`toEngineContent`, moved to `shared/` in Stage 2 so it is not duplicated).
2. Run `rankDestinations()` from `domain/diagnosis/` with the validated answers, constraints, and settings. No second scoring implementation exists.
3. If the engine reports any ignored answer (unknown/unpublished question or option, too many options), or the recomputed result slugs differ from `expected` in content or order, return `409 conflict` **without calling the provider**. This covers content edited during a quiz and tampered requests.
4. `expected` is used only for this equality check. The client never sends scores, ranks, or text, and nothing client-supplied besides validated IDs and constraint values reaches the model.

### Two output shapes and the ID mapping
- **Model-facing (internal)**: each destination gets an opaque ID (`d1`, `d2`, …) assigned in **slug order, not rank order**, and the destinations are listed in slug order, so neither IDs nor order reveal the ranking. The model returns `{ "explanations": [{ "id": "d1", "text": "…" }] }`.
- **Client-facing API**: `{ "explanations": [{ "slug": "kyoto", "text": "…" }] }` in the server's rank order. The server maps `id → slug` with the table it built for this request; IDs never leave the server, and slugs never reach the model.
- The model output is accepted only if its ID set equals the input ID set exactly (no missing, extra, or duplicate IDs). The client shows a text only on the card whose slug matches; responses never contain ranks, scores, or any field the client could use to reorder.

### Data sent: app Worker vs Workers AI
| Recipient | Data | Not sent |
|---|---|---|
| Public Worker (our code on Cloudflare), once per AI request | locale; answers as question/option slugs; trip days, months, budget amount and currency if entered; `expected` slugs. Cloudflare also sees normal request metadata (IP address, user agent) as for any request. | — |
| Workers AI (model inference on Cloudflare) | fixed instructions; output language; localized names of up to 5 attributes with the strongest positive preference; per destination: opaque ID, name, country name, authored summary (≤ 600 chars), up to 5 highlights (≤ 100 chars each), localized names of its matched attributes (engine `topAttributes`) | answers or question text, budget, trip days, months, budget/season/duration statuses, costs, cautions, best-season text, slugs, ranks, fit scores, IP address, seed |

- Neither recipient stores the request: the app writes no D1 rows and logs no content; for standard inference Workers AI does not keep inputs/outputs or train on them (verification log). AI Gateway is not used (it could log content).
- The preference summary needs a small new pure function in `domain/diagnosis/` (top attributes of the preference vector, which is not exported today), with tests.
- UI disclosure (shown next to the toggle before the user opts in; final wording and translations in Stage 4). English intent: "When on, your answers and trip conditions are sent once to this site's server to check the results. Only a summary of your preferences and the recommended destinations' descriptions are sent to Cloudflare Workers AI to write the explanation. Nothing is saved. Rankings are never decided by AI."

### Model role, prompt, and output validation
- Role split: the deterministic explanation (matched attributes, authored summary, cost, season, duration, budget notes) is always shown and is the only place for facts. The AI text is an additional paragraph labelled as AI-generated and possibly inaccurate, rendered as plain text (no Markdown or HTML).
- Prompt (server-only; never sent to the client, checked by `scripts/verify-bundles.mjs`): fixed English instructions with the output language as a parameter. The model is told that it is an editor explaining why each destination may suit the stated preferences; that it must use only the provided data; that it must not state or imply rankings, scores, comparisons between the destinations, prices, costs, dates, seasons, opening hours, visa or entry rules, safety claims, or named facilities, events, or businesses not in the data; and that text inside the data block is data, never instructions. Data is passed as JSON inside explicit delimiters.
- Structural controls, which matter more than the prompt: the model receives no rank, score, cost, date, or status data; IDs and order hide the ranking; the response is reduced to `{ slug, text }` and cannot change which cards are shown or their order. Users cannot inject text: every user input is a validated ID or number. The only free text the model sees is admin-authored content.
- Output validation (Zod plus checks): JSON object of the exact shape; ID set equality; each text 40–400 characters (*minimum lowered to 10 on 2026-10-18, see "Model decision"*), total ≤ 2,500; no digits, URLs, `<`/`>`, or Markdown markers; language plausibility (`ja` must contain kana or kanji; `en`/`es` must not contain CJK characters; English vs Spanish is not distinguished). Any violation discards the whole response (`503 ai_unavailable`). Per-item fallback is a possible later refinement.
- **These checks are auxiliary guards. They block some obvious failure patterns (invented prices, times, links, markup, wrong script); they do not and cannot verify that the text is true, that it makes no ranking claim, or that it introduces no new fact.** The guarantees that matter are structural: ranking, eligibility, scores, and all factual fields come from the deterministic engine and authored content and are displayed independently of the AI text.
- Locale: destination content follows the ADR-012 fallback chain; the model writes in the requested locale. This is generated supplementary text, labelled as such, not a substitute for curated translations (CLAUDE.md).
- Limits: output token cap about 600 (the parameter name differs per model); JSON mode (`response_format: json_schema`) when the chosen model honours it, always followed by our own validation.

### Errors, timeouts, logging
- Statuses (ADR-015): `400 invalid_request`, `403 forbidden` (origin), `405`, `409 conflict` (content mismatch), `413`, `415`, `429 rate_limited`, `503 ai_unavailable` (feature disabled, provider error, quota, timeout, invalid output), `500 internal_error`. No provider messages, prompts, or model output in error bodies.
- `env.AI.run` documents no timeout or abort option, so the server stops waiting after 8 s (`Promise.race`) and returns `503`; the inference may continue and still consume Neurons. The client aborts after 12 s. Waiting for the model is I/O, not CPU time; D1 reads and ranking are the same work as the content endpoint (10 ms CPU limit on Free; measure in Stage 2).
- UI: every failure keeps the deterministic results and shows a non-blocking notice (`409`: content changed, reload to get explanations; `429`: try again later; others: AI assistance unavailable).
- Logs: one line per request with `event`, `outcome`, `model`, `latencyMs`, `destinationCount`. Never answers, constraints, prompts, model output, IP addresses, or provider error text.

### Usage limits and the risk of no daily budget
*Partly superseded on 2026-10-18 by "Stage 5 preparation decisions" below: no global rate-limit key, IPv6 keys by /64 prefix, and preconditions for enabling AI. The accepted risks listed here still apply.*
- Kill switch: `AI_ASSIST_ENABLED` Worker variable; anything other than `"true"` returns `503 ai_unavailable` without calling the provider. Default disabled in config, so AI is opt-in per environment.
- Final ceiling on Workers Free: Workers AI fails after 10,000 Neurons/day (reset 00:00 UTC) and does not bill.
- Rate Limiting binding (if available on Free, see open decisions): two limiters checked before any D1 read or AI call: per-client key `ip:<CF-Connecting-IP>` (e.g. 5 per 60 s) and one global key (e.g. 60 per 60 s). IP is used against Cloudflare's general advice because the app has no accounts; it limits innocent users behind shared IPs (mobile carriers, offices) and does not stop an attacker rotating IPs. The IP is used only as an in-memory counter key and is not logged.
- Properties of that binding that limit what it can promise: periods of 10 or 60 s only; counted **per Cloudflare location**, so the global key is per-location and the real worldwide rate can be a multiple of the setting; eventually consistent and permissive, so bursts can briefly exceed the limit; not an accounting system. It throttles bursts; it does not cap daily usage.
- **No daily usage budget in the MVP** (a durable counter would need a writable store: D1 writes from the public Worker contradict ADR-018; KV or Durable Objects add a service). Accepted risks:
  1. One client, or many IPs, can use up the shared 10,000 Neurons early in the UTC day; AI assistance is then unavailable for everyone until reset. The core diagnosis is unaffected.
  2. Rejected requests still count against the Workers Free 100,000 requests/day shared with the content API; abuse of this endpoint can therefore also affect the core site. The rate limiter reduces work per request, not request count.
  3. Timed-out inferences may still consume Neurons.
  4. Local development and manual tests that call the real model consume the same daily allocation.
  5. **On Workers Paid, usage above the free allocation is billed with no app-level ceiling.** A daily budget (or an AI Gateway/account-level spend control, if one exists) is therefore a **precondition for moving to Paid** while AI is enabled.
  Mitigations: kill switch, rate limiter, small output cap, single request per result set, monitoring of 429/503 counts in logs.

### Model selection (*decided 2026-10-18: see "Model decision"*)
- Candidates and estimated cost: see "Phase 4 verification log". Constraints: default locale `ja`; Llama 3.x does not list Japanese as supported (secondary source); Gemma 4 and Qwen3 are Apache 2.0 and multilingual but listed as reasoning models, whose reasoning tokens add cost and latency, and how to disable reasoning on Workers AI is not documented; the JSON-mode documentation and model pages disagree on supported models.
- Plan: Stage 3 reads the model ID from configuration, so changing it is a configuration change. Stage 5 (owner-approved, logged-in, consuming Neurons) compares `gemma-4-26b-a4b-it`, `qwen3-30b-a3b-fp8`, and `llama-3.1-8b-instruct-fp8` on a fixed set of seeded results in `ja`/`en`/`es` for: schema validity rate, guard rejection rate, language quality, statements that imply rank or add facts (human review), latency, and measured Neurons. *Update (2026-10-18)*: the cases, criteria, budget, and record format are in `docs/AI_EVALUATION.md` and `docs/ai-evaluation/cases.json` (fixed model inputs, mostly fictional destinations, instead of seeded results). The result and the license obligations of the chosen model (for Llama, "Built with Llama" attribution) are recorded here.

### Architecture
- `domain/diagnosis/`: unchanged ranking; one new pure preference-summary function.
- `shared/`: request/response contract (`zod/mini`, also validated by the client), engine-content mapping, trip-constraint limits, `ai_unavailable` error code.
- `server/ai/`: `ExplanationProvider` interface (one method, input = validated model-facing data, output = unvalidated model data), Workers AI adapter, prompt builder, output validation. `server/public/ai-explanations.ts`: the use case (validate → load → rank → compare → build input → call → validate → map IDs).
- `worker/index.ts`: app built from injectable dependencies (provider, rate limiter, clock) so tests use fakes; production wires the `AI` and rate-limit bindings.
- Client: a small API client and hook; results page shows the AI paragraph or a notice; nothing is stored.
- No new npm dependency is expected (binding APIs; types from `@cloudflare/workers-types`).

### Test policy
- No test calls a real provider. Unit and Workers-runtime tests use a fake provider and a fake rate limiter; the local rate-limit simulation may be added for one integration test.
- Required cases: valid request → texts mapped to the recomputed slugs; schema violations, duplicates, over-limit counts, values above `MAX_TRIP_DAYS`/`MAX_BUDGET`, oversized body, wrong media type, foreign origin, other methods; unpublished/unknown IDs and `expected` mismatch → `409` with zero provider calls; fake provider returning reordered, missing, extra, or duplicate IDs, text over limits, digits, URLs, markup, wrong script, non-JSON, thrown errors, quota-like errors, and a never-resolving promise (timeout) → `503` with deterministic results unaffected; response never contains rank or score fields and its order equals the engine's; kill switch and rate limit → no provider call; captured logs contain no answers, constraints, prompt, output, or IP; client bundle contains no prompt text; AI off → zero requests (unit and E2E); AI on → one request, text shown with the AI label, notices for `409`/`429`/`503`/timeout; ja/en/es catalogs complete.
- Guard tests document known patterns only; they are not evidence of factual correctness. Prompt rules about rank and facts are evaluated by human review in Stage 5, not by automated tests.
- E2E mocks the endpoint with `page.route`; no real model in CI.

### Implementation stages (each ends with checks, a summary, and an owner-approved commit)
1. Documentation (this ADR, verification log, ARCHITECTURE).
2. Server foundation with a fake provider: shared contract and constants, mapping move, preference summary, endpoint, recomputation, mismatch handling, kill switch, rate-limit interface, error code, tests.
3. Workers AI adapter, prompt, output validation, timeout, logging, `ai` binding and configuration (after checking local-development impact).
4. Client UI, disclosure text, notices, translations, accessibility and E2E tests (mocked).
5. Optional, owner-approved: real-model evaluation and Neuron measurement; choose the model; finalize docs (how to disable AI, how limits work).

### Implementation status (Stage 2, 2026-10-18)
Implemented locally and tested with a fake provider and fake limiters; nothing calls a real model yet.
- Shared: `shared/ai-explanation.ts` (request/response contract), `shared/engine-content.ts` (moved from `src/diagnosis/engineContent.ts`), `shared/trip-constraints.ts` (`MAX_TRIP_DAYS`, `MAX_BUDGET` moved from the constraints form), and `MAX_QUIZ_QUESTIONS`, `MAX_RESULT_COUNT`, `MAX_OPTIONS_PER_QUESTION` in `shared/quiz-settings.ts` (the admin option limit now uses the same constant).
- Domain: `topPreferences()` in `domain/diagnosis/summary.ts`.
- Boundaries: `server/ai/` is under the same ESLint admin-import restriction as `server/public/`; the existing boundary test covers everything the public Worker reaches.
- Server: `server/ai/provider.ts` (interface), `server/ai/output.ts` (structural output validation: exact shape and ID set), `server/public/ai-explanations.ts` (use case), `createPublicApp()` in `worker/index.ts` with injectable provider and limiters. `readJsonBody` accepts `zod/mini` schemas.
- Moved forward from Stage 3 because they belong to the use case and are testable without a model: the 8 s timeout with an `AbortSignal` for the provider, structural output validation, and the outcome-only log line.
- Not wired yet: no provider (the default app always answers `503 ai_unavailable`), no rate-limit bindings, and no `AI_ASSIST_ENABLED` in `wrangler.jsonc` (unset means disabled). `wrangler.jsonc` is unchanged.
- Request order in the handler: method (`405`, `Allow: POST`) → same `Origin` (`403`) → kill switch and provider (`503`) → rate limiters (`429`, before the body is read) → body (`415`/`413`/`400`) → `answers ≤ settings.maxQuestions` (`400`) → recomputation (`409`) → provider → output validation (`503`).

### Implementation status (Stage 3, 2026-10-18)
Implemented locally and tested with a fake `AI` binding; no model has been called and `wrangler.jsonc` is unchanged.
- `server/ai/prompt.ts`: fixed English system prompt with the rules above, output language as a parameter, data as JSON between `<data>` delimiters with `<`/`>` escaped so embedded text cannot close the block, and a JSON Schema allowing exactly the request's IDs.
- `server/ai/output.ts`: text guards on every item (40–400 characters, minimum lowered to 10 on 2026-10-18, no digits including full-width ones, no links, no `<>*`#|` or Markdown links, Japanese script required for `ja`, no CJK for `en`/`es`). Any failure discards the whole response. The separate 2,500-character total from the design is not implemented because five items of at most 400 characters cannot exceed 2,000. Numbers written as words (for example 三日) pass; the guards remain auxiliary.
- `server/ai/workers-ai.ts`: adapter for the four shortlisted models only (other IDs leave AI unavailable). Per-model request options: Llama uses `max_tokens`; Gemma uses `max_completion_tokens`; Gemma and Qwen get `chat_template_kwargs.enable_thinking: false`. These names come from `@cloudflare/workers-types` 5.20261016.1 and the model pages; their effect is unverified until a real call. The answer is read from `{ response }` or `{ choices[0].message.content }`.
- Output token cap raised from the planned ~600 to 1,500: five paragraphs of up to about 200 characters in Japanese plus JSON need more than 600 tokens, and a truncated JSON response would always fail validation. Recalculate Neurons with this cap in Stage 5.
- Timeout: the provider receives the `AbortSignal` through the third `run` argument. `signal` exists in `AiOptions` in `@cloudflare/workers-types` but not in the bindings documentation, so whether Workers AI stops the inference on abort is unverified; the 8 s server-side race applies either way.
- Wiring (`aiDependenciesFromEnv` in `worker/index.ts`): `AI` binding + `AI_MODEL` + `AI_ASSIST_ENABLED === "true"` enable AI; `AI_CLIENT_RATE_LIMITER` and `AI_GLOBAL_RATE_LIMITER` are used when bound. None is configured, so the deployed behaviour is still `503 ai_unavailable`.
- `scripts/verify-bundles.mjs` fails the build if the public client bundle contains the prompt marker, or if the public Worker bundle does not (so the check cannot pass vacuously); a unit test keeps the marker in sync.
- Not done, pending owner decisions: adding the `ai` binding, `AI_MODEL`, `AI_ASSIST_ENABLED`, and rate-limit bindings to `wrangler.jsonc` (open decisions 1, 2, 4); choosing the model (3). The digit rule (5) is implemented as designed (all digits rejected) and is one regular expression to relax.

### Implementation status (Stage 4, 2026-10-18)
- Client: `src/diagnosis/aiClient.ts` (one POST, 12 s timeout, response validated with the shared schema, texts accepted only for displayed slugs; 409 → content changed, 429 → busy, anything else → unavailable) and `src/diagnosis/useAiExplanations.ts` (request built from in-memory state; at most one request per distinct request, so a language change sends one new request; no automatic retry; nothing stored).
- Results page: a `role="status"` line reports loading, ready, or the failure reason. Each card gets an "AI-generated note" block with a heading, the plain-text note, and a label saying it is AI-written and may contain errors, placed after the deterministic explanation; card order always follows the engine. The blocks are not landmarks, because one region per card with the same name failed axe `landmark-unique`.
- Constraints page: the toggle hint states what is sent to the site's server and what is sent to Workers AI, that nothing is saved, and that AI never decides the ranking (ja/en/es).
- Tests: client and request-builder unit tests, flow tests (AI off → no request; on → one request with IDs only, notes, order kept against a reordered response; 409/429/503/500/network → notice and unchanged results; language switch → one new request), axe on results with AI notes (ja/en/es), and E2E (real preview server without AI configuration → one request, 503, notice; mocked success → notes in rank order; off → no request). E2E never calls a model.
- Remaining: Stage 5 (owner-approved real-model evaluation) and the configuration decisions below.

### Stage 5 preparation decisions (2026-10-18)
Status: **Accepted by the owner (2026-10-18)**, including: operate on Workers Free while AI is enabled; per-client limit of 5 requests per 60 s keyed by IPv4 address or IPv6 /64; no global key; evaluation through the Workers AI REST API with a token from the shell environment; code changes C1–C6. Facts are in "Stage 5 preparation checks". Nothing below has been configured or deployed.

#### A. Usage and cost control: what is guaranteed, what only suppresses, what only detects
| Kind | Control | State |
|---|---|---|
| Guaranteed bound | Per-request limits: body ≤ 64 KiB, schema bounds (≤ 30 answers, ≤ 20 options, ≤ 5 destinations), model input truncated (summary 600, 5 highlights × 100 characters), one provider call per request, output cap 1,500 tokens, server timeout 8 s, client timeout 12 s | Implemented (Stages 2–4) |
| Guaranteed bound | No automatic retry anywhere: the server calls the provider once; the client never retries and sends one request per distinct request | Implemented |
| Guaranteed bound | Kill switch `AI_ASSIST_ENABLED` (anything but `"true"` → no provider call) | Implemented; takes effect on the next deployment |
| Guaranteed bound (**only on Workers Free**) | Workers AI fails after 10,000 Neurons/day and does not bill | Platform behaviour; depends on the account plan (要確認 by the owner) |
| Suppression (best effort) | Per-client Rate Limiting binding, one key per client address (B) | Code ready; binding not configured; availability on the account unconfirmed |
| Detection | Workers Logs outcome counts; Workers AI dashboard Neurons; budget alerts if the account is eligible | Not enabled; runbook below |

- Worst-case cost per request: about 7,000 input and 1,500 output tokens (five destinations at the truncation limits in Japanese, prompt included; estimate, not measured). At the verified prices that is about 136 Neurons for `llama-3.1-8b-instruct-fp8`, 105 for `gemma-4-26b-a4b-it`, and 78 for `qwen3-30b-a3b-fp8` (plus reasoning tokens if reasoning cannot be disabled), so the free allocation covers at least about 70 worst-case requests per day; typical requests are about 22–34 Neurons (verification log).
- No global rate-limit key (owner decision): one shared key lets ordinary users exhaust each other's quota and does not stop distributed abuse. Total usage is protected instead by the Free-plan Neuron ceiling, detection, and the kill switch. The `globalLimiter` option in `worker/index.ts` is therefore not bound; removing it is proposed code change C2.
- Concurrency: no app-level concurrency control. Workers AI allows 300 requests/minute per account for the candidates; the per-client limiter covers short bursts from one client; distributed bursts are bounded only by the daily Neuron ceiling.
- Retries do not multiply usage: none on the server, none in the client; a language switch sends one new request; a timed-out inference may still consume Neurons (`AbortSignal` effect unverified). Switching back to an earlier language currently re-sends that request (the hook remembers only the last result); caching settled results per request is optional code change C4.
- **Preconditions for enabling AI for the public** (all required):
  1. The account is on Workers Free while AI is enabled, so the Neuron ceiling is a hard daily cost bound. On Workers Paid, an app-level daily cap must exist first (D).
  2. A per-client limiter is active: the Rate Limiting binding, confirmed on an approved preview deployment, or, if it is unavailable, a small Durable Object limiter (separate approval; Durable Objects with SQLite are available on Free). **Without a per-client limiter AI stays disabled**, because a single client could otherwise use the whole daily allocation.
  3. Workers Logs enabled for the public Worker and the monitoring runbook (E) in place.
  4. `AI_ASSIST_ENABLED` defaults to `"false"` in the deployed configuration; turning it on is a separate, explicit owner decision.
- Residual risk outside AI: requests rejected with 429 still count against the Workers Free 100,000 requests/day shared with the content API. Flooding this endpoint can therefore make the core site's API fail with Error 1027 until 00:00 UTC (the UI shows its "temporarily unavailable" state). This applies to every public API route; WAF rate-limiting rules would need a zone (custom domain) and were not examined (要確認, later phase).

#### B. Rate-limit key and privacy
- Source: `CF-Connecting-IP` only (set by Cloudflare's edge; the public Worker has no proxy in front of it). Never `X-Forwarded-For`, which can carry client-supplied values. If the header is absent (local development, tests), all such requests share one key `unknown`, which fails safe.
- Key: IPv4 → the full address; IPv6 → the /64 prefix, because one subscriber usually controls a whole /64 and could otherwise rotate addresses freely. Proposed code change C1 (today the full address is used).
- Using an address as a limiter key is not logging it: the address is never written to logs, responses, or storage by the app; tests assert this. *Update (2026-10-24)*: Workers Logs invocation events stored every request's address and geolocation outside the app's control; they are disabled in all deployment environments ("Phase 7 verification log"). The key exists only in the limiter's counters for the configured window (10 or 60 s). Hashing the key was considered and not chosen: Cloudflare already processes the address to serve the request, and a keyed hash would add a secret without reducing what the app stores (nothing).
- Limit: proposed 5 requests per 60 s per key: one results page plus a few language switches or restarts. Users behind a shared address (mobile carrier NAT, offices) can see 429 sooner; they keep the deterministic results with a "busy" notice. Clients that change addresses can bypass the limit; they remain bounded by the daily Neuron ceiling and are visible in monitoring.
- Separation of concerns: the per-client limiter protects fair use between users; the Neuron ceiling, monitoring, and the kill switch protect total usage.

#### C. Local development and deployed environments
- The top-level `wrangler.jsonc` stays without `ai`, `ratelimits`, or AI variables. `npm run dev`, `npm run build`, unit and Workers tests, and E2E (`vite build` + `vite preview`) therefore never configure a remote AI binding and answer `503 ai_unavailable`, as today.
- Deployed configuration goes into a named environment (proposed `env.production`, and `env.preview` for an approved test deployment) that redeclares every binding it needs: `d1_databases`, `ai`, `ratelimits`, `vars` (`AI_ASSIST_ENABLED: "false"`, `AI_MODEL`), and `observability`. A deployment is built with `CLOUDFLARE_ENV=<env> vite build`, whose output contains only that environment, and deployed from that output (deployment commands are Phase 6 work).
- Binding versus feature: the `ai` binding can exist with `AI_ASSIST_ENABLED: "false"`; then no model is ever called. Enabling the feature is only the variable change plus a deployment.
- Real-model runs happen only through the opt-in evaluation runner (`docs/AI_EVALUATION.md`), never through `npm test`, `npm run check`, or E2E.
- Secrets: the binding needs none. The evaluation runner's API token lives only in the developer's shell environment, never in `.dev.vars` (the build copies it into `dist/`, see `docs/DEVELOPMENT.md`) and never in committed files.
- Failure handling is unchanged: missing binding, missing or unknown model, disabled switch, limiter refusal, or provider failure all keep the deterministic results and show a notice.

#### D. Monthly and Paid-plan considerations
- Workers AI has no documented hard spend cap on Paid. Budget alerts are informational, account-wide, delayed by about a day, and their availability for this account is unconfirmed. Before moving to Paid with AI enabled: an app-level daily cap (Durable Object counter) and a budget alert are required, and the owner reviews the cost estimate.

#### E. Monitoring and stopping (runbook)
- Enable Workers Logs for the public Worker. Each AI request logs one line `{ event, outcome, model, latencyMs, destinationCount }`; 429 and disabled outcomes are not logged yet (proposed code change C3, without addresses).
- First week after enabling AI: check daily; afterwards weekly or after any announcement. Look at Workers AI Neurons in the dashboard and outcome counts in Workers Logs.
- Stop when Neurons exceed about 70% of the daily allocation before 12:00 UTC on a normal day, when `rate_limited` or `provider_error` outcomes spike, or on any suspicion of abuse: set `AI_ASSIST_ENABLED` to `"false"` in `env.production.vars` and redeploy. Whether a dashboard edit of a variable is faster and how it interacts with the next deployment is 要確認 (dashboard-only settings are overwritten by deployments for `workers_dev`; check the same for `vars`).

#### F. Digit rule
- Kept unchanged (owner decision). The evaluation records every digit rejection separately and also reports how many responses would have passed without the digit check, so the cost of the rule is visible before any change is considered.

#### Proposed code changes for Stage 5 (not implemented; each needs approval)
- C1: limiter key from `CF-Connecting-IP` with IPv6 /64 prefixes (`worker/index.ts`), with tests.
- C2: remove the unused global limiter option.
- C3: log `rate_limited` and `disabled` outcomes (no address).
- C4 (optional): remember settled AI results per request in the client hook.
- C5: `env.production` / `env.preview` in `wrangler.jsonc` with `AI_ASSIST_ENABLED: "false"`, and enabling observability (only together with an approved deployment plan). The admin Worker's environments also get the `ADMIN_RATE_LIMITER` binding (ADR-020).
- C6: the opt-in evaluation runner (`docs/AI_EVALUATION.md`), plus a git-ignored output directory.

### Implementation status (Stage 5a, 2026-10-18)
Implemented and tested without any real model call, login, or configuration change.
- C1: `server/public/rate-limit-key.ts` builds the limiter key from `CF-Connecting-IP` only: `ip4:<address>`, `ip6:<first four hextets>::/64` (IPv4-mapped IPv6 counts as IPv4), and `unknown` for a missing or unparsable header. `X-Forwarded-For` is ignored. Unit tests in `test/node/rate-limit-key.test.ts`; Worker tests check the key per header.
- C2: the global limiter option and `AI_GLOBAL_RATE_LIMITER` were removed; `AI_CLIENT_RATE_LIMITER` is the only limiter binding.
- C3: requests stopped before the use case log `outcome: "disabled"` or `"rate_limited"` with the same five fields as other AI log lines (`model` is null when no provider is configured); still no addresses, answers, or texts.
- C4: `useAiExplanations` remembers every settled result (including failures) per request for the life of the results page, so switching back to an earlier language sends nothing and failures are never retried automatically.
- C6: opt-in runner `test/ai-eval/runner.ts` with entry `test/ai-eval/run.eval.ts`, run only by `npm run ai:eval` (the `ai-eval` Vitest project exists only for that script; `vitest list` shows no evaluation test otherwise). It refuses to start unless `AI_EVAL_CONFIRM=consume-neurons`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` are set; uses the production request builder and validation; makes one call per job with no retry; stops before any call that could push the estimated total over the budget (default and maximum 5,000 Neurons); records to the git-ignored `.ai-eval/` without the token or API error messages. Unit tests with a fake fetch in `test/node/ai-eval-runner.test.ts`. Verified locally that `npm run ai:eval` without the confirmation fails before any network access. Before the first run (owner-approved, 2026-10-18): the pre-call estimate counts one token per request character (was two characters per token, which could underestimate Japanese), and a run ID whose records already exist is refused. For the ten cases, the resulting worst case for one round is about 1,970 Neurons (typical about 670); the budget remains an estimate, not a measurement of billed usage.
- Not done: C5 (`env.production` / `env.preview`, observability) waits for an approved deployment plan; the evaluation has not been run. *Update (2026-10-18, Phase 6)*: `env.preview` is configured in both Wrangler configs (placeholder database ID, AI disabled); `env.production` waits for the production approval (`docs/DEPLOYMENT.md` "3.3 Configuration").
- Known issue (要確認): in one of four full E2E runs, the real-server AI test on the mobile project received HTTP 500 instead of 503 from `POST /api/ai/explanations` with AI disabled. It did not recur in three further full runs (with web-server logging) or twelve repeated runs of that test, and the server log of the failing run was not captured, so the cause is unknown. The test was not relaxed. If it recurs, capture the `[WebServer]` output (`DEBUG=pw:webserver`) and look for an `api_error` line.

### Evaluation round 1 (run `2026-10-20-r1`, executed 2026-10-18; preliminary)
Run by the owner in their own terminal: 30 calls, one per model and case; raw records in the git-ignored `.ai-eval/`.
- `gemma-4-26b-a4b-it`: 7 of 10 accepted. Rejections: `too_short` in C04 and C05 (the model answered briefly instead of inventing details), `digit` in C07 (it quoted "2,300m" and "3" from the input; it would pass without the digit rule). Preliminary review found no unsupported facts, no ranking language, no instruction followed in C08, and no added facts for the real cities in C06; owner scoring of naturalness pending. Median latency 3.2 s, maximum 5.3 s (from the owner's machine). Reported usage 336–931 prompt and 53–203 completion tokens per call, about 79 Neurons for 10 calls; the small completion counts suggest reasoning was off (not verified).
- `qwen3-30b-a3b-fp8`: 0 of 10 accepted: the API returned results with usage (about 63 Neurons in total) but the adapter extracted no answer. The runner did not record the result shape, so the cause is unknown. Fix (2026-10-18): `extractModelAnswer` now falls through a null `response` to `choices[0].message.content` or `choices[0].text` and never uses `reasoning_content`; the runner records `resultShape`. A re-run is needed.
- `llama-3.1-8b-instruct-fp8`: all 10 calls returned HTTP 403 with error code 5025, which is not in the Workers AI error table (page updated 2026-09-17). The runner stores no error messages, so the cause is unknown (要確認; a single manual call by the owner can show the message).
- Follow-up (2026-10-18):
  - Qwen re-run `2026-10-20-r2-qwen` (10 calls, about 63 Neurons by token estimate): still 0 accepted. The recorded `resultShape` shows a chat-completions result whose `choices[0].message.content` is `null`, with 132–872 characters in `reasoning` / `reasoning_content` and `finish_reason` "stop". The lengths track the expected answer sizes, so the answer is probably emitted in the reasoning field when `chat_template_kwargs.enable_thinking: false` is sent (not verified: content is not stored). By design the adapter never uses reasoning output, so Qwen fails with the current profile; the next probe sends the same request without `chat_template_kwargs`.
  - Llama: one manual REST call by the owner with only `{"prompt": ...}` succeeded (HTTP 200, `usage.neurons` ≈ 0.77). So the model is available to the account, and the 403/5025 is triggered by something in the production request (`messages`, `response_format`, `temperature`, or `max_tokens`); probes isolate it.
  - Probes by the owner with case C04 (2026-10-18): the production Llama request fails with "This model doesn't support JSON Schema" (code 5025); without `response_format` it succeeds (about 5.3 Neurons) but returned an entry for only one of the two IDs. Qwen without `chat_template_kwargs` (default reasoning) put the answer in `content` with the correct shape, using 760 completion tokens (3,133 characters of reasoning, about 24.7 Neurons). Both models wrote 20–25-character texts for this sparse case, below the 40-character minimum.
  - Profile changes (`server/ai/workers-ai.ts`): Llama 3.1 8B no longer sends `response_format` (the format is requested only by the prompt, so missing or extra IDs are more likely); Qwen keeps its default reasoning, which raises cost and latency per call and can hit the 1,500-token cap before the answer (`finish_reason` "length"). Gemma is unchanged. The runner now records `finishReason` and `reasoningChars`. Request options therefore differ per model; the comparison measures each model as it can be used, not under identical parameters.
  - Workers AI reports `usage.neurons` in REST responses (seen for Llama; present in every Qwen result shape). The runner now uses it for records (`reportedNeurons`) and the budget, falling back to the token estimate and then to the conservative pre-call estimate.
- Gates (section 5 of `docs/AI_EVALUATION.md`): no model passes yet. All three models write short texts for sparse input, so the 40-character minimum alone can keep any model below the 90% acceptance gate; whether to change that guard is an owner decision (the digit rule stays unchanged).
- Estimated total from the runner: about 888 Neurons, of which about 746 are conservative estimates for the 403 calls; reported usage was about 142 Neurons. Compare with the dashboard.

### Evaluation round 2 (run `2026-10-20-r3`, executed 2026-10-18)
Same 10 cases, one call per model and case, with the per-model profiles from round 1's follow-up. Run by the owner; 30 calls, 462 Neurons as reported by `usage.neurons` (the runner's total matched). Latency measured from the owner's machine through the REST API.

| Model | Accepted | Rejections | `finish_reason` | Median / max latency | Over 8 s | Reported Neurons per call (median) |
|---|---|---|---|---|---|---|
| `gemma-4-26b-a4b-it` | 7/10 | `too_short` ×2 (C04, C05), `digit` ×1 (C07) | stop ×10 | 3.3 s / 5.1 s | 0 | 7.3 |
| `qwen3-30b-a3b-fp8` | 7/10 | `too_short` (C04), `digit` (C07), `structure` (C05: output cap reached during reasoning) | stop ×9, length ×1 | 6.5 s / 9.9 s | 3 | 26.1 |
| `llama-3.1-8b-instruct-fp8` | 0/10 | `structure` ×8, `digit`, `too_short` | not reported | 8.0 s / 17.6 s | 5 | 10.4 |

Preliminary review (owner scoring pending; local sheets `.ai-eval/*-review.md`):
- Gemma: the same pattern as round 1 (14 of 20 accepted over both rounds). Polite Japanese style throughout, no ranking language, no followed injection in C08, no added facts for the real cities in C06; in C05 it states plainly when a destination does not match the preferences. All six rejections over both rounds come from the minimum length (four) and the digit rule (two, both C07 quoting "2,300m" from the input).
- Qwen: format is now valid in most calls, but answers contain more unsupported embellishment (for example "historic architecture" and "innovative design" in C09), Japanese answers often use the plain style unlike the rest of the UI, reasoning makes calls about 3.5 times as expensive as Gemma, and latency fails the gates (median above 5 s, 30% over 8 s).
- Llama 3.1 8B without JSON Schema: malformed or split JSON, missing IDs, a translated key (`explanaciones`), a refusal in C08, and embellishment ("must-visit", "perfect fit"). Not usable for this contract.

Gate result (`docs/AI_EVALUATION.md` section 5): no model passes as specified. Gemma passes every gate except acceptance (70% against 90%), and only because of the minimum-length and digit guards; with the minimum length lowered to 10 characters its acceptance over both rounds would be 18/20 (90%), the digit rule unchanged.

**Recommendation (Proposed, owner decision):** choose `@cf/google/gemma-4-26b-a4b-it`; exclude Qwen (latency, cost, embellishment) and Llama 3.1 8B (format). Before adoption: (1) decide the minimum-length guard (see open decision 6); (2) read Google's Gemma terms of use and prohibited-use policy (not yet read); (3) keep the digit rule and accept that destinations whose authored text relies on numbers get the deterministic explanation only. Estimated production usage with Gemma: about 7–14 Neurons per request, so roughly 700–1,400 requests per day within the free allocation (estimate from these 20 calls).

### Model decision (2026-10-18)
Status: **Accepted by the owner (2026-10-18)**, subject to the owner's review of Google's Gemma terms of use and prohibited-use policy.
- Model: `@cf/google/gemma-4-26b-a4b-it` (request options in `server/ai/workers-ai.ts`: JSON Schema, `max_completion_tokens`, reasoning disabled). Qwen 3 30B and Llama 3.1 8B are not used; their profiles stay in the shortlist only so that a later re-evaluation needs no code change.
- Minimum explanation length lowered from 40 to 10 characters. The digit rule and discarding the whole response on any failure are unchanged.
- Re-checking the stored outputs of both rounds with the new minimum (no new model calls): Gemma 18/20 accepted (90%); both rejections are C07, where the model quotes "2,300m" from the authored text. Qwen 8/20 and Llama 0/20 are unchanged in substance.
- Gate deviation, accepted with the digit rule: Gemma meets the acceptance, injection, factuality (preliminary), and latency gates, but case C07 never passes. Destinations whose authored text relies on numbers will get the deterministic explanation only. Owner scoring of naturalness and factuality in the local review sheets is still open and can reverse this decision.
- Not yet configured: `AI_MODEL` and the `ai` binding are set only with C5 (named deployment environments) and an approved deployment plan; AI stays disabled until then.

### Open decisions (要確認)
Updated 2026-10-18. Decided: see the status lines of "Stage 5 preparation decisions" and "Model decision".
1. Rate Limiting binding availability for this account: confirm on an approved preview deployment. If unavailable, choose between a Durable Object limiter and keeping AI disabled. *Update (2026-10-18)*: the deployment of `travel-discovery-admin-preview` on Workers Free accepted the `ADMIN_RATE_LIMITER` binding without error. The deployment of `travel-discovery-preview` accepted `AI_CLIENT_RATE_LIMITER` as well. That the limiters actually refuse requests (429) on the deployed Workers is not verified yet; the AI limiter is consulted only after the `AI_ASSIST_ENABLED` check, so it can only be observed with AI enabled.
2. Confirm in the dashboard that the account is on Workers Free and whether a payment method is attached (budget alert eligibility). *Update (2026-10-18)*: the owner confirmed the account is on Workers Free and logged in with `wrangler login`; the preview D1 database `travel-discovery-preview` was created with owner approval. A payment method is attached to the account (used for a domain registration). The app must not cause new charges: stay on Workers Free, enable no paid feature, and never upgrade the plan silently (ADR-015). With a payment method attached, budget alerts may be available ("Stage 5 preparation checks"); not checked.
3. ~~Model choice~~: Gemma 4 26B ("Model decision"); JSON Schema and disabled reasoning confirmed to work for it in both rounds.
4. Approval of the evaluation run itself (API token creation, Neuron use) and of C5 with a deployment plan.
5. Whether a dashboard variable edit is an acceptable fast kill switch, or the redeploy procedure is the only one. *Update (2026-10-18, "Phase 6 verification log")*: a dashboard edit is overwritten by the next `wrangler deploy` unless `keep_vars` is set, so after an emergency dashboard edit the same value must also be committed to the configuration before the next deployment.
6. ~~Minimum explanation length~~: lowered to 10 characters ("Model decision").
7. Gemma terms of use and prohibited-use policy: the owner reviews them before AI is enabled.


## ADR-027: Continuous integration (GitHub Actions)
- Status: **Accepted** (Phase 5e, 2026-10-18; owner chose CI without E2E for now)
- Decision: `.github/workflows/ci.yml` runs on pushes to `main` and `dev` and on pull requests: `npm ci` with Node from `.nvmrc`, then `npm run check` (lint, type-check, unit and Workers-runtime tests, production build with bundle checks). It uses no secrets, never deploys, and never calls Workers AI (the evaluation runner exists only under `npm run ai:eval`).
- Hardening: `permissions: contents: read`; `actions/checkout` and `actions/setup-node` pinned to full commit SHAs with the version in a comment (v7.0.1 → `3d3c42e5…`, v7.1.0 → `949feb24…`, resolved from the official repositories on 2026-10-18; both were the latest releases); `persist-credentials: false`; one run per ref with cancellation.
  - *Verified* (GitHub docs "Security hardening for GitHub Actions"): pinning to a full-length commit SHA is the recommended way to use third-party actions immutably; set `GITHUB_TOKEN` to read-only by default.
- E2E is not run in CI: it needs a browser download (bundled Chromium, a few hundred MB from Microsoft's CDN, ADR-025), which requires the owner's approval. Revisit when deployments start, so that pull requests also exercise the admin and public journeys.
- Verified locally: a fresh `git clone` of the repository passes `npm ci` and `npm run check` on macOS (2026-10-18). *Verified* (2026-10-19, reported by the owner): the runs on GitHub's Linux runners passed after the owner pushed. The lockfile contains the Linux platform packages for `workerd` and `esbuild` (ADR-016), so `npm ci` is expected to work there.
- Updating actions: replace the SHA and the version comment together after checking the release notes.

---

## Admin authentication status (2026-10-17)

Separates what exists today from what is only designed, so nothing is claimed as protected before it is.

| Item | Implemented now | Verified by tests | Verifiable only after an approved deployment |
|---|---|---|---|
| Admin Worker exists, separate from the public Worker | Yes: `admin-worker/`, `wrangler.admin.jsonc`, `vite.admin.config.ts` (built to `dist-admin/`) | Yes: separate builds; bundle checks | Deployment itself |
| Public Worker contains no admin routes or write code | Yes (GET/HEAD read API only) | Yes: `/api/admin/*` → 405/404 on the public app; boundary test; bundle check; lint | — |
| Worker-level Access ("All traffic") on the admin Worker | No (dashboard/API setting; requires approval) | — | Yes: unauthenticated request to admin `workers.dev` URL is redirected to Access login |
| Access covers admin Version URLs, or `preview_urls: false` on the admin Worker | `"preview_urls": false` in `wrangler.admin.jsonc` (present in the built config) | — | Yes: Version URLs either disabled or behind login |
| No Bypass hostname/path app matches admin hostnames | No (configuration rule) | — | Yes: review Access apps list |
| JWT validation (`jose`, JWKS from team domain, issuer + AUD, RS256, required `exp`, non-empty `email`) in every admin API handler | Yes: middleware on `/api/admin/*` (`server/admin/access-auth.ts`) | Yes (`test/workers/admin-auth.test.ts`): for **every** registered admin route, missing/malformed token, wrong audience, wrong issuer, expired, missing `exp`, untrusted key, missing email claim, missing AUD config → 403; non-`cloudflareaccess.com` team domain → 403; cookie alone → 403; cross-origin mutations → 403; valid token → accepted | Yes: real tokens from Access validate against the real JWKS; RS256 assumption |
| Local dev identity cannot reach production | Yes: only passed under `import.meta.env.DEV` | Yes: bundle check in `npm run build`; test that the env var is ignored without the resolver; production preview with `.dev.vars` → 403 | — |
| `Cf-Access-Jwt-Assertion` reaches the Worker through the static-assets router (`run_worker_first`) | — | Cannot be tested locally | Yes (currently *not verified*; admin API fails closed until confirmed) |
| Public Worker Version URLs disabled | Yes: `"preview_urls": false` in `wrangler.jsonc` | Build output contains `"preview_urls":false` (checked manually) | Yes: no Version URL is served after deploy |
| Admin UI static assets protected | Only by Worker-level Access (assets contain no secrets) | — | Yes: unauthenticated request to the admin URL is redirected to the Access login |
| Public `workers.dev` stays enabled (it is the public site until a domain is chosen) | Default | — | — |
| Custom Domain for admin | Deferred by owner | — | — |

*Deploy-only checks on `travel-discovery-admin-preview` (2026-10-18, version `8bc1cc2c`)*: unauthenticated requests to `/`, `/destinations`, a JS asset, and `/api/admin/me` on the `workers.dev` URL are redirected (302) to the Access login of the team domain, also after two minutes of polling; Version URLs are disabled (`preview_urls: false`; the dashboard lists no Version URL). The owner signed in (Access showed "Sign in with Cloudflare", the Cloudflare account login, with the Emails policy) and the admin UI worked, which confirms that `Cf-Access-Jwt-Assertion` reaches the Worker through the static-assets router and that the token validates against the configured issuer and AUD. The shared database with the deployed public preview Worker was confirmed the same day (ADR-018). The same checks passed on the production admin Worker `travel-discovery-admin` (version `1b184825`, its own AUD): Access redirect on every checked path, owner sign-in, and `/api/admin/me` returning the owner's address. Not checked: rejection of an address outside the policy (needs a second Cloudflare account, because the only identity provider is the Cloudflare account login). The 429 response of `ADMIN_RATE_LIMITER` was observed on 2026-10-24 ("Phase 7 verification log").

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
2. **Deploy-only verifications** (need approval): Access coverage of the admin Worker's `workers.dev` URL and static assets; `Cf-Access-Jwt-Assertion` delivery through the static-assets router; RS256 signing of Access JWTs; two deployed Workers binding one D1 database; D1 daily-limit error text (ADR-015). *Update (2026-10-18)*: all but the D1 daily-limit error text verified on the preview Workers ("Admin authentication status", ADR-018, "Phase 6 verification log").
3. **Remote resources** (need approval): creating the D1 database(s), replacing the placeholder `database_id`, setting `ACCESS_TEAM_DOMAIN` / `ACCESS_POLICY_AUD` for the admin Worker.
4. ~~`range` question type and `multiple_choice` publishing~~: resolved in ADR-021 (no `range` type; multiple choice publishable).
5. ~~**Admin API rate limiting**~~: implemented as an optional per-identity binding in Phase 5d (ADR-020); the binding itself is configured with the deployment environments.
6. ~~Phase 2 inputs~~ (budget currencies, structured seasons, fallback explanation): resolved in ADR-021. Remaining: whether to add curated estimates per currency or a dated reference-rate table so `USD`/`EUR` budgets can be compared with destinations that only have `JPY` estimates.
10. ~~Scoring location~~: browser (ADR-022).
7. **drizzle-kit audit advisory** (ADR-003): held as a development-only transitive dependency; re-evaluate on dependency or usage changes.
8. **Shared D1 (ADR-018)**: revisit the private content Worker option if the code-level read-only boundary proves insufficient.
9. **Locale in URL**: deferred to Phase 3 routing design.
11. **Phase 4 AI explanations (ADR-026, Proposed)**: Rate Limiting binding on Workers Free, per-IP keys, model choice and license, local-development impact of the `ai` binding, digit rule; no daily AI budget in the MVP (must exist before moving to Workers Paid with AI enabled).
