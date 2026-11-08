# Prompt 24 — Share balance through scores and questions

Approved by the owner as drafted (2026-11-08). Each content change still needs the owner's approval during the phase.

A few destinations appear far more often than others, and Phase 23's result variety did not change that (owner decision 2026-11-08: balance belongs to a review of attribute scores and questions, ADR-037). On random answers to `content/initial-v10.json`, Cape Town is in 42.8% of the top-5 results and Rome in 0.4%. In the Phase 23 simulation, Cape Town is the best fit in 15–18% of quizzes and within 10 fit points of the best in 35–39%; Rome and Jaipur rarely come that close ("Phase 23 verification log" in `docs/working/DECISIONS.md`).

Two causes are visible in the data:
- **Broad profiles.** Cape Town scores 4 or 5 on seven of eleven attributes and below 3 on only one, so it fits many different answer sets fairly well.
- **Near-duplicates.** Rome (history 5, food 5, art 5) competes with London, Paris, Barcelona, Prague, and others that score the same on its strong attributes and higher on city life, nightlife, or ease of getting around. No question separates what makes Rome different, so it rarely wins.

The goal is not equal shares. A destination should appear when the answers fit it, and a respondent whose ideal is a destination should find it. The engine (fit formula, ranking, result variety, question selection) does not change in this phase; only content does: attribute scores, question options, and their effects, with the owner's approval of every change. Do not push, commit, deploy, import, or change dependencies without the owner's explicit approval; a push to `main` deploys production, and a content import is an owner step.

## Read first
`CLAUDE.md`, [SPEC.md](../docs/en/SPEC.md), [DIAGNOSTIC_ALGORITHM.md](../docs/en/DIAGNOSTIC_ALGORITHM.md), [DATA_MODEL.md](../docs/en/DATA_MODEL.md), [OPERATIONS.md](../docs/en/OPERATIONS.md) section 8 (publishing content and importing bundles), `docs/working/DECISIONS.md` (ADR-028, ADR-031, ADR-037, and the Phase 12, 13, 15, 21, and 23 verification logs, including the attribute rubrics of Phase 12 and 13), `prompts/12-attributes-and-questions.md` and `prompts/21-more-destinations-and-costs.md` for the review process, `content/initial-v10.json`, and `test/simulation/`.

## Tasks
1. **Diagnosis.** For each destination, report:
   - its top-5 share on random answers and for sparse respondents;
   - for anchored respondents whose ideal it is, how often it is found in the top 5 and how often it is first;
   - its nearest competitors (destinations with the most similar scores) and which attributes separate them;
   - which questions and options can raise it above those competitors.
   Name the destinations that are over-shown (broad profile) and those that are hard to find even for respondents whose ideal they are. Add any measure needed to `test/simulation/` (local only, never part of `npm run check`). If the billing guard blocks `npm run quiz:simulate`, give the owner the exact command.
2. **Proposals (owner review).** Propose a small set of changes, each with its reason and its simulated effect:
   - score corrections under the written 0/3/5 rubrics, where a score is higher or lower than the rubric supports (for example a broad destination scored 4 where 3 fits the rubric better);
   - option changes or new options on existing questions that separate near-duplicates (for example a stronger effect for ancient sites or a cuisine option), with texts in `ja`, `en`, `es`, and `fr`;
   - at most one new question, only if no option change can separate the near-duplicates, with texts in all four locales.
   Do not lower a score only to reduce a share: every change must be defensible from the rubric or the destination's authored text. No new attribute, destination, or schema change.
3. **Simulation of the proposal.** Compare the current bundle and the proposal on: the top-5 share spread (highest, lowest, standard deviation); for anchored respondents, found in the top 5 and first, per destination (the worst ten); the quiz-quality measures of the Phase 15 log (ideal overlap, ideal first found, fit loss) for sparse and anchored respondents; and the question variety. Report every destination whose numbers get worse. The owner decides which changes to keep.
4. **Bundle.** Write `content/initial-v11.json` with only the approved changes on top of `initial-v10.json`, with a test that every other item is unchanged. Prepare a rendered review copy of the changed items in all four locales for the owner. Rehearse the import locally as in Phase 21 ("Update existing items", then compare `/api/diagnosis-content` in four locales with the bundle).
5. **Tests and checks.** Update any test that depends on the changed content. Run `npm run check` and, if any UI text changes, `npm run test:e2e`.
6. **Documentation.** A "Phase 24 verification log" with the diagnosis, the proposals and the owner's decisions, the simulation numbers, and the rehearsal; DIAGNOSTIC_ALGORITHM.md only if a documented example changes (with the Japanese twin); IMPLEMENTATION_PLAN.md; and the README status with its twin. The production import is an owner step after the deployment, recorded afterwards.

Not part of this phase: changing the engine or its constants (fit formula, result variety band, question selection, quiz settings); new attributes or destinations; a region field; enabling AI; and the other follow-ups (source re-checks, small islands on the map).

## Acceptance
- Every content change has a stated reason under the rubric or the authored text, and the owner approved it.
- In the simulation, the top-5 share spread is smaller than with `initial-v10.json`, and anchored respondents find the hard-to-find destinations more often, with the quiz-quality measures within the bounds the owner approves.
- `content/initial-v11.json` differs from `initial-v10.json` only by the approved changes, and the local import rehearsal matches it in four locales.
- `npm run check` passes (and `npm run test:e2e` if UI text changed); AI stays disabled, and the account stays on Workers Free.
