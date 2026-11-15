# Prompt 26 — Lisbon, Edinburgh, and Copenhagen

Approved by the owner as drafted (2026-11-14). Each content change still needs the owner's approval during the phase.

Phase 25 made Rome and Maasai Mara easier to find, but three European cities stayed hard to find even for respondents whose ideal they are ("Phase 25 verification log" in `docs/working/DECISIONS.md`; `content/initial-v12.json`, found in the top 5 / first): Lisbon 17% / 0%, Edinburgh 41% / 4%, Copenhagen 58% / 1%. Their profiles suggest why:
- **Lisbon** scores 4 on most attributes and 5 on none. Barcelona scores the same or higher on almost every attribute, so Lisbon can win only through its warmer climate.
- **Edinburgh** is close to London and Prague, which score the same or higher on everything except nature. What sets it apart (a small city on foot, a hill and the sea in view, a cool climate) is expressed weakly or not at all.
- **Copenhagen** is close to London and Paris, which score the same or higher on every attribute except relaxation. Its relaxed pace, cycling, and design are not separated from a big capital.

The goal is not that these three always appear. A respondent whose ideal is one of them should find it in the top 5 more often, without making the quiz worse for everyone else. The engine (fit formula, ranking, result variety, question selection) and the quiz settings do not change. The first response is the diagnosis and a proposal only: no content file, code, configuration, or database change.

Do not push, commit, deploy, import, change quiz settings, run remote Cloudflare commands, or change dependencies without the owner's explicit approval for that action. A push to `main` deploys production, and a content import is an owner step. AI stays disabled, and the account stays on Workers Free. In the first week of December 2026, remind the owner of the dated Workers Logs and Billing check ([OPERATIONS.md](../docs/en/OPERATIONS.md) section 3 "Dated").

## Read first
`CLAUDE.md`, [DIAGNOSTIC_ALGORITHM.md](../docs/en/DIAGNOSTIC_ALGORITHM.md) §2, §3, and §7, [DATA_MODEL.md](../docs/en/DATA_MODEL.md), [OPERATIONS.md](../docs/en/OPERATIONS.md) section 8, `docs/working/DECISIONS.md` (ADR-028 "Update mode", ADR-031, ADR-037, and the Phase 12, 13, 15, 21, 24, and 25 verification logs), `prompts/24-share-balance.md`, `prompts/25-new-attributes.md`, `content/initial-v12.json`, and `test/simulation/` (especially `new-attributes.sim.ts` and its measurement limits).

## Tasks
1. **Diagnosis (local, no content change).** For each of the three cities, report its nearest competitors and which of them it can never outrank (a competitor that scores the same or higher on every attribute), with the numbers. Report what a traveller would choose it for, from its authored text, and whether an attribute, question, or option already expresses that. Report which questions its anchored respondents answer and where their answers lead instead.
2. **Rubrics.** The 0/3/5 rubrics of the eleven older attributes are not in the repository (Phase 24 caveat). Write them for every attribute a proposal touches, from the attribute definitions and the existing scores, and record them in the verification log. Mark any rubric that existing scores contradict.
3. **Proposals (owner review), in this order of preference:**
   - score corrections under the written rubrics, where a city or a competitor is scored higher or lower than the rubric supports (for example, everything scored 4 where the rubric gives 3 or 5);
   - option changes or new options on existing questions that separate these cities from their competitors, with texts in `ja`, `en`, `es`, and `fr`;
   - at most one new attribute (for example the scale of a city: a compact city on foot versus a large capital), with a rubric, scores for all 44 destinations, and the questions or options that use it, only if the first two cannot separate them.
   Do not change a score only to change a share: every change needs a reason from the rubric or the authored text. No new destination and no schema change.
4. **Simulation (owner decides what to keep).** With `test/simulation/new-attributes.sim.ts` or an extension of it, compare `initial-v12.json` with each proposed change alone and with the set: found in the top 5 and first for each destination's anchored respondents, the fixed population (harm to respondents indifferent to the change), the top-5 share spread, and the Phase 15 quality measures. Report every destination whose numbers get worse, with the noise level of each measure. If the billing guard blocks a script, give the owner the exact command.
5. **Bundle.** Write `content/initial-v13.json` with only the approved changes on top of `initial-v12.json`, with a test that every other item is unchanged. Prepare a rendered review copy of any new or changed text in four locales, kept out of the repository. Rehearse the import locally ("Update existing items", then compare `/api/diagnosis-content` in four locales with the bundle on every field).
6. **Tests and checks.** Run `npm run check`, and `npm run test:e2e` if any UI or quiz text changes. If a check is blocked, do not work around it; give the owner the exact command.
7. **Documentation.** A "Phase 26 verification log" with the diagnosis, rubrics, proposals and decisions, simulation numbers with their limits, and the rehearsal; ADR-028 content files; the README counts with the Japanese twin if they change; and IMPLEMENTATION_PLAN.md. The production import and its comparison are owner steps, recorded afterwards.

Not part of this phase: engine changes, quiz settings, new destinations, a region field, enabling AI, and source re-checks.

## Acceptance
- Every change has a stated reason under a written rubric or the authored text, and the owner approved it.
- In the simulation, respondents whose ideal is Lisbon, Edinburgh, or Copenhagen find it more often, and the harm to everyone else stays within the bounds the owner approves. A city that cannot be helped without an engine change is reported with the reason.
- `content/initial-v13.json` differs from `initial-v12.json` only by the approved changes, and the local import rehearsal matches it in four locales.
- `npm run check` passes (and `npm run test:e2e` if text changed); AI stays disabled, and the account stays on Workers Free.
