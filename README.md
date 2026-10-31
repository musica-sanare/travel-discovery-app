English | [日本語](README.ja.md)

# Travel Discovery

Travel Discovery is a responsive web app that recommends overseas city/region-level destinations from a short, varied quiz and optional trip constraints (length, months, budget). The diagnosis is deterministic and works without AI; optional AI notes are off by default and never change the ranking. Results show indicative cost ranges with their source and date, never live prices, and link to flight and hotel searches. The UI supports Japanese, English, and Spanish; Japanese is the default.

**Status:** Phases 0–14 are complete. Preview and production run on `workers.dev` with AI disabled, and both serve 30 destinations in 23 countries, scored on 11 attributes, and 29 quiz questions. Phase 14 made the AI limits and status visible in the UI and deployed the strict per-client AI quota to both environments; the steps for enabling AI on production are prepared, and AI stays disabled until the owner approves them ([Implementation plan](docs/working/IMPLEMENTATION_PLAN.md)). No license has been chosen yet ([Public release checklist](docs/working/PUBLIC_RELEASE.md)).

## Quick start

Requirements: Node.js `>=22.22.0` (`.nvmrc` pins 24) and npm. No Cloudflare account, login, or secret is needed.

```bash
npm ci
npm run db:reset:local
npm run dev
```

Open http://localhost:5173. `npm run db:reset:local` deletes any existing local D1 data, then applies migrations and loads the seed data. Run `npm run check` for lint, type-check, tests, and build.

## Documentation

- [Documentation index](docs/en/README.md): specification, architecture, guides, and working docs.
- [Local development](docs/en/DEVELOPMENT.md): all commands, the admin app, tests, and the project layout.
- `CLAUDE.md` and `prompts/` hold the instructions for Claude Code.
