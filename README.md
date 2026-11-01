English | [日本語](README.ja.md)

# Travel Discovery

Travel Discovery is a responsive web app that recommends overseas city/region-level destinations from a short, varied quiz and optional trip constraints (length, months, budget). The diagnosis is deterministic and works without AI; optional AI notes are off by default and never change the ranking. Results show indicative cost ranges with their source and date, never live prices, and link to flight and hotel searches. The UI supports Japanese, English, Spanish, and French; Japanese is the default.

## Status

- Phases 0–17 are complete.
- Production runs on `workers.dev` with AI disabled and deploys through Cloudflare Workers Builds on each push to `main`. It serves 30 destinations in 23 countries, scored on 11 attributes, and 29 quiz questions.
- Phase 14 made the AI limits and status visible in the UI and deployed the strict per-client AI quota to both environments.
- Phase 15 made the quiz prefer questions that separate the likely destinations.
- Phase 16 added sourced cost estimates: 10 destinations now have indicative costs in `JPY`, `USD`, and `EUR`.
- Phase 17 added French to the UI and all published content.
- The steps for enabling AI on production are prepared. AI stays disabled until the owner approves them ([Implementation plan](docs/working/IMPLEMENTATION_PLAN.md)).
- The repository is private; the [public release checklist](docs/working/PUBLIC_RELEASE.md) tracks what remains before it is published.

## Quick start

Requirements: Node.js `>=22.22.0` (`.nvmrc` pins 24) and npm. No Cloudflare account, login, or secret is needed.

```bash
npm ci
npm run db:reset:local
npm run dev
```

Open http://localhost:5173.

- `npm run db:reset:local` deletes any existing local D1 data, then applies migrations and loads the seed data.
- `npm run check` runs lint, type-check, tests, and build.

## Documentation

- [Documentation index](docs/en/README.md): specification, architecture, guides, and working docs.
- [Local development](docs/en/DEVELOPMENT.md): all commands, the admin app, tests, and the project layout.
- `CLAUDE.md` and `prompts/` hold the instructions for Claude Code.

## License

[MIT](LICENSE), for the code, the docs, and the content bundles in `content/`. Cited sources keep their own terms; the bundles cite them and do not copy them.
