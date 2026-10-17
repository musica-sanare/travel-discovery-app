# Local Development

## Prerequisites
- Node.js `>=22.22.0` (`.nvmrc` pins 24)
- npm (bundled with Node; the committed `package-lock.json` is authoritative)

No Cloudflare account, login, or secrets are needed for local development at this stage.

## Setup

```bash
npm ci
```

`.npmrc` sets:
- `engine-strict=true`: installs fail on an unsupported Node version.
- `strict-allow-scripts=true`: installs fail if any dependency has install scripts not listed in `package.json` `allowScripts`. The scripts of `esbuild`, `fsevents`, and `workerd` are explicitly denied because they are not needed (ADR-016 in `docs/DECISIONS.md`).

If `npm ci` fails with `ESTRICTALLOWSCRIPTS`, a dependency update introduced a new install script. Review what it does, then record a decision with `npm deny-scripts <pkg>` (preferred) or `npm approve-scripts <pkg>` (version-pinned). Never use `--dangerously-allow-all-scripts` or `npm approve-scripts --all`.

Do not install with `--omit=optional`: the `workerd` and `esbuild` binaries come from platform-specific optional dependencies.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR. The API Worker runs in the local Workers runtime (workerd) via `@cloudflare/vite-plugin`. |
| `npm run build` | Type-check (`tsc -b`) and build client assets (`dist/client`) and the Worker (`dist/worker`). |
| `npm run preview` | Serve the production build locally in the Workers runtime. Run `npm run build` first. |
| `npm run lint` | ESLint (type-aware rules). |
| `npm run typecheck` | TypeScript project references build, no emit. |
| `npm test` | Vitest unit and component tests (single run). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run check` | Lint, type-check, tests, and build in sequence. |

There is intentionally no deploy script yet. Do not run `wrangler deploy` without the owner's approval.

## Project layout

```text
index.html             SPA entry (default <html lang="ja">)
public/_headers        Security headers for static assets (not applied to /api/*)
src/                   Browser application (React)
  app/                 Router configuration and root layout
  components/          Shared UI components
  i18n/                Locale list, typed message catalogs, i18next setup
  pages/               Route pages
worker/                Cloudflare Worker (API under /api/*)
wrangler.jsonc         Worker, static assets, and (later) binding configuration
docs/                  Specification, architecture, and decisions
```

## Routing between assets and the Worker
`wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]`. Only `/api/*` requests invoke the Worker; all other paths are served from static assets, and unknown paths fall back to `index.html` for client-side routing (`not_found_handling: "single-page-application"`).

Quick check while `npm run dev` is running:

```bash
curl http://localhost:5173/api/health
```

## Adding UI text
1. Add the key and Japanese text to `src/i18n/messages/ja.ts`.
2. Add the same key to `en.ts` and `es.ts`. The type checker fails until all three match.
3. Use `t("your.key")` from `useTranslation()`; never hard-code UI strings in components.

## Environment variables
None are required yet. Local Worker variables will go in `.dev.vars` (git-ignored). See `.env.example` for planned placeholders.
