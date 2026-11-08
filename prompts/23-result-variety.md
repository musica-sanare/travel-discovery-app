# Prompt 23 — Result variety and share balance

Approved by the owner as drafted (2026-11-08). The values and options marked as owner decisions are still decided during the phase.

The results are fully deterministic: the same answers always show the same five destinations. A few broad destinations dominate. In the Phase 21 simulation on `initial-v10.json`, Cape Town is in 45.3% of the top-5 results, while Rome (0.7%) and Jaipur (0.8%) almost never appear ("Phase 21 verification log" in `docs/working/DECISIONS.md`). The owner wants the results to keep following the answers, but which of the well-fitting destinations are shown may change from one quiz to the next (owner, 2026-11-08).

The model is the seeded selection of the recipe-discovery app (its ADR-029 D5 and D6, `domain/recommendation/select.ts`). Its candidates come from the conditions. A greedy pick prefers attribute values not yet shown, and the remaining ties fall to a seeded order, `mix32(mix32(seed) ^ fnv1a(id))`, so the result is reproducible from the seed. In this app the quiz already draws a session seed for question selection (`src/diagnosis/session.ts`, DIAGNOSTIC_ALGORITHM.md "Question selection").

Fit scores, hard filters (budget), annotations (season, duration), the explanation data, and the quiz itself do not change. Do not push, commit, deploy, or change dependencies without the owner's explicit approval; a push to `main` deploys production.

## Read first
`CLAUDE.md`, [SPEC.md](../docs/en/SPEC.md) (sections on the diagnosis and the acceptance list), [DIAGNOSTIC_ALGORITHM.md](../docs/en/DIAGNOSTIC_ALGORITHM.md), `docs/working/DECISIONS.md` (ADR-021, ADR-022, ADR-026 "Server-side recomputation", ADR-031, ADR-035, the Phase 15 and Phase 21 verification logs), `domain/diagnosis/` (ranking, scoring, question selection), `src/diagnosis/session.ts`, `src/diagnosis/useDiagnosis.ts`, `src/diagnosis/useAiExplanations.ts`, `shared/ai-explanation.ts`, `server/public/ai-explanations.ts`, `src/pages/ResultsPage.tsx`, and `test/simulation/`. For the model only: `~/repos/recipe-discovery-app/domain/recommendation/select.ts` and its ADR-029 D5–D6 (read, do not copy files between repositories without saying so).

## Proposed design (each point needs the owner's decision)
1. **The best fit stays first.** The destination with the highest fit (the current order: fit, coverage, slug) is always shown in first place, so the result always reflects the answers.
2. **The other slots are drawn from a near-fit band.** The band holds the eligible destinations other than the first whose fit is at least `fit₁ − Δ`, limited to the best `N` by the current order (for example `Δ` 10 points and `N` 8; the values come from the simulation in task 2). When the band holds no more destinations than free slots, the result is the current one. Within the band, the pick is seeded and weighted toward higher fit (for example a seeded key scaled by fit, or a weighted draw without replacement); the exact rule is chosen in task 2.
3. **Diversity.** Prefer a destination whose country is not yet shown. Optionally, also prefer one whose strongest wanted attribute is not yet shown, as recipe-discovery does with its attributes. There is no region field in the data; adding one needs a migration and content work, so it is not proposed here.
4. **Display order is by fit.** The chosen destinations are shown in the current order (fit, coverage, slug), so no card shows a higher fit below a lower one. The rank number stays the position on the page.
5. **Seed.** The selection uses the quiz's session seed, mixed with a constant so that it is independent of question selection. Reloading or switching the language shows the same results; a new start or restart draws a new seed. `fewer_than_requested` and the other notices keep their meaning.
6. **Optional: "Show other destinations".** A button on the results page shows another draw from the same band (seed + 1), preferring destinations not yet shown in this session, as recipe-discovery's "Show a different type". The owner decides whether to include it in this phase.

## Constraints from the current design
- **AI endpoint.** `POST /api/ai/explanations` recomputes the ranking on the server and refuses a request whose `expected` list differs (409). The request must carry the selection seed, validated as an unsigned 32-bit integer, and the server must use the same selection. AI stays disabled; no model is called.
- **Determinism.** SPEC.md and DIAGNOSTIC_ALGORITHM.md say that the same answers give the same ranking. This becomes: the same answers, data, and seed give the same results. Fit values and their order remain fully deterministic.
- **Strengths (ADR-035).** They are computed among the shown results, so they follow the selection without a rule change.
- **No server-side history** (CLAUDE.md principle 6): anything "already shown" lives only in the browser session.

## Tasks
1. **Baseline.** Measure the current top-5 share per destination, the share of the most and least frequent destinations, and the destinations never shown, with the existing simulation on `initial-v10.json`. The billing guard blocked Claude's run of `npm run quiz:simulate` in Phase 21; if it is blocked again, give the owner the exact command and record the owner's run.
2. **Compare candidates in the simulation** (local only, never part of `npm run check`):
   - the current rule;
   - the band with two or three values of `Δ` and `N`;
   - the band with and without the country preference and the attribute preference.
   For each, report the share spread (highest, lowest, never shown), the fit loss against the current top 5 (mean and worst), how often the best fit is first (must be 100%), how many distinct result sets one answer profile gets over 30 seeds, and the time per ranking. Propose one candidate; the owner decides.
3. **Implement the approved rule** in `domain/diagnosis/` as pure functions with the seed as input, used by the browser and the AI endpoint alike. Update `shared/ai-explanation.ts` (`seed`), `server/public/ai-explanations.ts`, `useDiagnosis`, and `buildAiRequest`.
4. **UI.** Keep the results page as it is, except the optional button of design point 6 if the owner chooses it, with texts in `ja`, `en`, `es`, and `fr`. Restarting must show a new draw; reloading must not.
5. **Tests and checks.** Unit tests for the band, the seeded order (reference values, independence from input order, adding a destination does not reorder the others), the country preference, the first place, the display order, and small pools (fewer eligible destinations than slots). Worker tests for the seed in the AI request (missing, invalid, and mismatched seeds). E2E: a reload keeps the results, a restart can change them, and the AI request carries the seed. Run `npm run check` and `npm run test:e2e`.
6. **Documentation.** A new ADR, DIAGNOSTIC_ALGORITHM.md and SPEC.md with their Japanese twins, ADR-026 "Server-side recomputation", a "Phase 23 verification log" with the simulation numbers, IMPLEMENTATION_PLAN.md, and the README status with its twin.

Not part of this phase: changing fit scores, attribute scores, or questions; a region field or other schema change; content changes; enabling AI; and the other content and map follow-ups (source re-checks, small islands on the map).

## Acceptance
- The best fit is always first, every shown destination is in the approved near-fit band, and the display order follows fit.
- The same answers, data, and seed give the same results; a new quiz can give different ones.
- In the simulation, the share spread is smaller than the baseline with the fit loss within the bound the owner approved, and the numbers are recorded.
- The AI endpoint accepts a request whose results come from the same seed and refuses a mismatched one; AI stays disabled.
- `npm run check` and `npm run test:e2e` pass, and the account stays on Workers Free.
