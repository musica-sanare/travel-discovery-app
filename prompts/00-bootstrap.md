# Prompt 00 — Bootstrap and architecture verification

You are the lead engineer implementing Travel Discovery in this repository.

Read `CLAUDE.md` and all documents under `docs/` before making changes. Treat them as the current product baseline.

## Language policy
- Communicate with the owner in Japanese at all times.
- Write all repository documentation and source comments in English.
- The app must support `ja`, `en`, and `es` from MVP, defaulting to `ja`.
- Select and document an i18n approach and locale-resource structure during Phase 0.

## Task
Do not implement the entire product yet. First inspect the repository, verify current official documentation and compatibility, and prepare a minimal, runnable foundation.

## Required actions
1. Inspect the existing repository and report what already exists.
2. Verify current official Cloudflare documentation for:
   - React + Vite deployment on Workers/static assets
   - local development and D1 bindings
   - D1 migrations and seeding
   - Cloudflare Access protection and how Worker/API requests are authenticated
   - Workers AI invocation, currently supported models, pricing/free allowance, and limitations
3. Verify current compatibility for the proposed React, Vite, React Router, Tailwind/shadcn, Drizzle, Zod, Vitest, Playwright, and Cloudflare tooling. Prefer stable compatible versions.
4. Update `docs/working/DECISIONS.md` with verified decisions, official source URLs, date checked, alternatives considered, and any unresolved `要確認`.
5. If an important decision cannot be verified or has a material security/cost impact, stop and ask before committing to it.
6. Propose the exact repository structure and package scripts.
7. Implement only the minimal foundation: app scaffold, strict TypeScript, lint/type-check/test/build scripts, basic route structure, and placeholder pages if needed.
8. Add `.gitignore` and `.env.example` with placeholders only.
9. Run all available checks and report their actual results.

## Constraints
- Do not deploy, create paid resources, set up a real production database, or modify external accounts without explicit approval.
- Do not implement custom authentication.
- Do not add AI calls yet.
- Do not generate large amounts of seed content yet.
- Do not silently guess about free-tier availability.
- Keep dependencies minimal and record rationale.

## Acceptance criteria
- Local development works from documented commands.
- Production build succeeds.
- Lint, type-check, and test scripts exist and pass.
- Current Cloudflare setup and admin protection path are documented.
- `docs/working/DECISIONS.md` distinguishes verified facts from assumptions.
- End with changed files, commands/results, unresolved questions, and the recommended next phase.
