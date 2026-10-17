# Travel Discovery

Travel Discovery is a responsive web app that recommends overseas city/region-level destinations based on a user's travel preferences and constraints. The UI supports Japanese, English, and Spanish.

Status: early development (Phase 0 complete). See `docs/IMPLEMENTATION_PLAN.md` for the phase plan. The full README (deployment, admin setup) is completed in Phase 5.

## Quick start

```bash
npm ci
npm run dev
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for all commands and the project layout.

## Repository layout

```text
travel-discovery-app/
├── CLAUDE.md                  Instructions for Claude Code
├── README.md
├── docs/
│   ├── SPEC.md                Product specification
│   ├── ARCHITECTURE.md        Architecture and layering
│   ├── DATA_MODEL.md          Logical data model
│   ├── IMPLEMENTATION_PLAN.md Phases and acceptance criteria
│   ├── DECISIONS.md           Architecture decision records and verification log
│   └── DEVELOPMENT.md         Local development guide
├── prompts/                   Per-phase prompts for Claude Code
│   ├── FIRST_MESSAGE.md
│   ├── 00-bootstrap.md
│   ├── 01-foundation.md
│   ├── 02-diagnostic-engine.md
│   ├── 03-public-ui.md
│   ├── 04-ai-assist.md
│   ├── 05-polish-and-e2e.md
│   └── 06-release.md
├── src/                       Browser application (React)
├── worker/                    Cloudflare Worker (API under /api/*)
├── index.html
├── wrangler.jsonc
└── package.json
```

## Working with Claude Code

1. Open the repository in Claude Code. It reads `CLAUDE.md` automatically.
2. Start a new session with `prompts/FIRST_MESSAGE.md`, then run one phase at a time with the prompt files listed in `docs/IMPLEMENTATION_PLAN.md`.
3. Do not start the next phase until the current phase's acceptance criteria pass.

## Language policy
- Claude Code conversations with the owner: Japanese.
- Repository documentation, source comments, and docstrings: English.
- App UI from MVP: Japanese, English, and Spanish (`ja`, `en`, `es`), with Japanese as default.

## Principles

- The core diagnostic logic is plain, deterministic code; the main features keep working when AI is unavailable.
- AI assistance is explicitly chosen by the user in the UI and is OFF by default.
- Destinations are selected and ranked by scoring; AI never decides or reorders candidates.
- Destinations are cities/regions, each linked to a country.
- Costs are indicative ranges with source, basis, and last-updated date. They are never presented as live prices.
- No user accounts and no server-side storage of diagnosis history in the initial release.
- Free tiers, available models, prices, and limits change; verify current official documentation at implementation time.
- Build the smallest working version first, then test and review each phase before moving on.

## Note

These documents are the initial specification (v0.1). Unclear points must not be guessed silently: list them as `要確認` (open items for the owner) and ask before implementing anything with a large impact.
