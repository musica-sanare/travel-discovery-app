# Prompt 27 — Taipei, Buenos Aires, Prague, and Sydney

Approved by the owner as drafted (2026-11-21). Each content change still needs the owner's approval during the phase.

Phase 26 made Lisbon, Edinburgh, and Copenhagen easier to find ("Phase 26 verification log" in `docs/working/DECISIONS.md`). On `content/initial-v13.json`, the destinations that respondents anchored on them find least often are now (400 anchored respondents each, `test/simulation/hard-cities.sim.ts`; found in the top 5 / first):
- **Taipei** 39% / 4%: ranked below Singapore 57%, New York 52%, Bangkok 47%, and London 45%. It scores 5 on food, nightlife, and getting around, like several large Asian cities.
- **Buenos Aires** 42% / 6%: ranked below London 73%, Paris 62%, and Copenhagen 44%. Barcelona beats it everywhere except food. Its share on random-like answers is the lowest of all destinations (sparse 0.5% in Phase 26), and it lost ground in Phases 25 and 26.
- **Prague** 53% / 2%: ranked below London 88%, Paris 67%, and Copenhagen 66%. Barcelona and Copenhagen beat it everywhere except history and culture, London everywhere except relaxation.
- **Sydney** 54% / 4%: not yet diagnosed.

Lisbon (47% / 4%) and Edinburgh (54% / 13%) were handled in Phase 26 and are not targets here; report them as watched destinations. Andalusia, Vancouver, and Siem Reap, which Phase 26 made worse, are watched too.

The goal is not that these four always appear. A respondent whose ideal is one of them should find it in the top 5 more often, without making the quiz worse for everyone else. The engine (fit formula, ranking, result variety, question selection) and the quiz settings do not change. The first response is the diagnosis and a proposal only: no content file, code, configuration, or database change.

Do not push, commit, deploy, import, change quiz settings, run remote Cloudflare commands, or change dependencies without the owner's explicit approval for that action. A push to `main` deploys production, and a content import is an owner step. AI stays disabled, and the account stays on Workers Free. In the first week of December 2026, remind the owner of the dated Workers Logs and Billing check ([OPERATIONS.md](../docs/en/OPERATIONS.md) section 3 "Dated").

## Read first
`CLAUDE.md`, [DIAGNOSTIC_ALGORITHM.md](../docs/en/DIAGNOSTIC_ALGORITHM.md) §2, §3, and §7, [DATA_MODEL.md](../docs/en/DATA_MODEL.md), `docs/working/DECISIONS.md` (ADR-028 "Update mode" and the Phase 24, 25, and 26 verification logs, especially the Phase 26 rubrics), `prompts/26-hard-to-find-cities.md`, `content/initial-v13.json`, and `test/simulation/` (`hard-cities.sim.ts`, `new-attributes.sim.ts`, and `phase26-variants.ts`).

## Tasks
1. **Diagnosis (local, no content change).** For each of the four cities, report its nearest competitors, any competitor that scores the same or higher on every attribute or on all but one, what a traveller would choose it for from its authored text, whether an attribute, question, or option already expresses that, and where its anchored respondents' answers lead instead.
2. **Rubrics.** Use the Phase 26 rubrics where they apply. Write 0/3/5 rubrics for any other attribute a proposal touches, record them in the verification log, and mark any rubric that existing scores contradict.
3. **Proposals (owner review), in this order of preference:**
   - score corrections under the written rubrics, for the target or a competitor;
   - option changes or new options on existing questions, with texts in `ja`, `en`, `es`, and `fr`;
   - at most one new attribute, with a rubric, scores for all 44 destinations, and the questions or options that use it, only if the first two cannot separate them.
   Do not change a score only to change a share: every change needs a reason from the rubric or the authored text. No new destination and no schema change.
4. **Simulation (owner decides what to keep).** Add the candidates as in-memory variants (as `phase26-variants.ts` does) and compare `initial-v13.json` with each change alone and with the set: found and first for anchored respondents, the fixed population, random and sparse shares, and the Phase 15 quality measures. Report every destination whose numbers get worse, with the noise level of each measure.
5. **Bundle.** Write `content/initial-v14.json` with only the approved changes on top of `initial-v13.json`, with a test that every other item is unchanged. If any text changes, prepare a rendered review copy in four locales, kept out of the repository. Rehearse the import locally ("Update existing items", then compare `/api/diagnosis-content` in four locales with the bundle on every field).
6. **Tests and checks.** Run `npm run check`, and `npm run test:e2e` if any UI or quiz text changes. If a check is blocked, do not work around it; give the owner the exact command.
7. **Documentation.** A "Phase 27 verification log" with the diagnosis, rubrics, proposals and decisions, simulation numbers with their limits, and the rehearsal; ADR-028 content files; the README with its Japanese twin; and IMPLEMENTATION_PLAN.md. The production import and its comparison are owner steps, recorded afterwards.

Not part of this phase: engine changes, quiz settings, new destinations, a region field, enabling AI, and source re-checks.

## Acceptance
- Every change has a stated reason under a written rubric or the authored text, and the owner approved it.
- In the simulation, respondents whose ideal is one of the four cities find it more often, and the harm to everyone else stays within the bounds the owner approves. A city that cannot be helped without an engine change is reported with the reason.
- `content/initial-v14.json` differs from `initial-v13.json` only by the approved changes, and the local import rehearsal matches it in four locales.
- `npm run check` passes (and `npm run test:e2e` if text changed); AI stays disabled, and the account stays on Workers Free.
