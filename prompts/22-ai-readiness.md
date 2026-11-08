# Prompt 22 — AI readiness fixes

AI is disabled on production. Enabling it is a separate owner decision after the dated Workers Logs and Billing check of 2026-12-01 to 07 ([AI_ENABLEMENT.md](../docs/en/AI_ENABLEMENT.md) section 4). A review of the AI path on 2026-11-08 found four weaknesses that should be fixed before that decision (owner, 2026-11-08):

1. The output guard rejects any digit, but some authored highlights contain digits ("Tram 28" for Lisbon, "4x4 tours" for Uyuni). A note that copies them discards the whole answer.
2. One failed text discards the notes of every destination in the answer.
3. There is no app-wide daily cap, only per-client limits (ADR-029). Many addresses together can use the whole daily Workers AI allowance. An app-wide cap was not adopted on 2026-10-31; the owner now wants one (2026-11-08).
4. The model gets each destination's matched attributes, whose number varies with fit (one to three, `TOP_ATTRIBUTE_COUNT`), and the prompt alone stops the model from turning that into a comparison.

The diagnosis, ranking, and deterministic texts do not change. No model call is made in this phase; AI stays disabled in every environment. Do not push, commit, deploy, or change dependencies without the owner's explicit approval; a push to `main` deploys production.

## Read first
`CLAUDE.md`, [SPEC.md](../docs/en/SPEC.md) section 8, [AI_ENABLEMENT.md](../docs/en/AI_ENABLEMENT.md), [OPERATIONS.md](../docs/en/OPERATIONS.md) section 4.4, `docs/working/DECISIONS.md` (ADR-026 with its Phase 14 amendments, ADR-029, the Phase 14 and Phase 21 verification logs), `docs/working/AI_EVALUATION.md`, `server/ai/` (prompt, output, provider, Workers AI adapter), `server/public/ai-explanations.ts`, `server/public/client-quota.ts`, `worker/ai-client-limiter.ts`, `worker/index.ts` (the AI routes), `shared/ai-explanation.ts`, `shared/ai-quota.ts`, `src/diagnosis/useAiExplanations.ts`, `src/pages/ResultsPage.tsx`, and `wrangler.jsonc`.

## Tasks
1. **Digits from the data.** Keep rejecting digits, except digit sequences that occur in the data sent to the model for that destination (for example `28` or `4x4` copied from a highlight). Define the rule in ADR-026, and add tests with the Lisbon and Uyuni texts in all four locales and with a digit that is not in the data.
2. **Per-destination rejection.** Keep discarding the whole answer when it is not valid JSON, has the wrong shape, or names a missing, extra, or duplicate ID. When the structure is valid, drop only the destinations whose text fails a text guard and return the others. A destination without a note shows no AI paragraph, without an error. Log the number of dropped notes and their reason codes in the existing `ai_explanation` line (no content). Decide in ADR-026 whether an answer with every note dropped counts as `invalid_output`.
3. **App-wide daily cap.** Add a daily limit for all clients together, checked after the per-client limits and before the model call, reset at 00:00 UTC.
   - Propose the value with its basis in the Workers Free allowance (10,000 Neurons per day, 7–14 Neurons per call measured; for example 500 calls). The owner decides the value.
   - Prefer reusing the quota Durable Object class with a fixed object name, which needs no Wrangler migration; if a new class is needed, add a `new_sqlite_classes` migration tag and say so.
   - A refusal answers 429 with a new limit kind (for example `global`), and the results page names it in all four locales ("AI notes are not available for the rest of the day"), next to the existing window and daily texts. `GET /api/ai/status` behaviour stays as it is unless the owner decides otherwise.
   - Update ADR-029 "Not covered", the risk table, AI_ENABLEMENT.md section 4 (budget and stop conditions), and OPERATIONS.md 4.4.
4. **No comparison signal.** Make each destination's input independent of how well it fits:
   - Tell the model to describe each destination on its own and never refer to another destination.
   - Propose how the matched attributes are passed without revealing the fit (for example always the destination's three strongest attributes among the stated preferences, or no list at all), with the effect on the notes; the owner decides.
   - Keep the opaque IDs in slug order.
5. **Tests and checks.** Unit tests for the guards, the per-destination result, the cap, and the model input; worker tests for the 429 body and the logs; client tests for a missing note and the new notice; E2E with a mocked AI response that drops one note and a mocked `global` 429 in all four locales. Run `npm run check` and `npm run test:e2e`. No call to Workers AI and no `npm run ai:eval`, which costs Neurons and needs its own approval.
6. **Documentation.** ADR-026 and ADR-029 amendments, SPEC.md section 8 if user-visible behaviour changes (with the Japanese twin), AI_ENABLEMENT.md and OPERATIONS.md (with their Japanese twins), a "Phase 22 verification log", IMPLEMENTATION_PLAN.md, and the README status with its twin. Record in the Phase 21 verification log that `2c46c0a` was deployed on 2026-11-08 (owner's push, production checked without login: 42 destinations, 0 differences).

Not part of this phase: enabling AI on production, any model call or evaluation, a model change, content changes, and the content and map follow-ups (source re-checks, result share balance, small islands on the map).

## Acceptance
- A note that copies a digit from its own data passes; a digit not in the data still fails, and other destinations' notes survive one failed text.
- An app-wide daily cap with the owner-approved value refuses requests with a named 429 after the per-client limits, and the results page explains it in four locales.
- The model input carries no fit signal approved by the owner, and the prompt forbids references between destinations.
- `npm run check` and `npm run test:e2e` pass; AI stays disabled in every environment, and the account stays on Workers Free.
- If the change needs a Durable Object migration, it is stated before the push, and the deployment keeps the AI routes answering as before while AI is disabled.
