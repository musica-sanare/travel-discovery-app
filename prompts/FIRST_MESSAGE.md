# Claude Code first message — Travel Discovery

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/IMPLEMENTATION_PLAN.md`, and `docs/DECISIONS.md`.

We are building an overseas destination recommendation app with Japanese, English, and Spanish UI (`ja`, `en`, `es`), defaulting to Japanese.

Language policy: communicate with the owner in Japanese at all times; write all repository documentation, source comments, and docstrings in English. Follow the docs as the baseline. The key product decisions are:
- City/region-level recommendations linked to countries.
- The application supports Japanese, English, and Spanish from MVP, with a visible language switcher and curated localized content.
- Database-backed questions and destination content, editable through a protected admin UI.
- Adaptive quiz, target 10 questions (default min 6 / max 12).
- Deterministic ranking; AI does not select or rank destinations.
- AI explanation is explicitly user-controlled in the UI and defaults OFF.
- When AI is disabled/unavailable, the complete core experience still works.
- Indicative costs only, with scope/basis/source/update date; no live price claims.
- No user accounts or server-side quiz-history storage in MVP.
- GitHub Private initially, with quality suitable for possible future public release.

Start with Phase 0 only. Verify current official Cloudflare docs, framework compatibility, free-tier details, Workers AI model availability, and a secure way to protect both admin UI and admin APIs. Record verified decisions and `要確認` items. Then scaffold a minimal runnable app and run checks. Do not build all phases at once, do not deploy, do not create paid resources, and do not invent facts about free limits. Ask before making a material security/cost/architecture decision that cannot be verified.
