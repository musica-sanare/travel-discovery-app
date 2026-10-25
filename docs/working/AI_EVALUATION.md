[Docs index](../en/README.md)

# AI Model Evaluation Plan (Phase 4, Stage 5)

Plan for a small comparison of Workers AI models for the optional AI explanations ([DECISIONS.md](DECISIONS.md) ADR-026). Running it requires the owner's explicit approval because it needs an API token and consumes Neurons.

**Status (2026-10-18):** two rounds were run by the owner (`2026-10-20-r1`, `2026-10-20-r3`, plus a Qwen re-run and manual probes). Results and the resulting choice of `gemma-4-26b-a4b-it` are recorded in ADR-026 "Evaluation round 1", "Evaluation round 2", and "Model decision". Raw records stay in the git-ignored `.ai-eval/`.

## 1. Scope

- Candidates: `@cf/google/gemma-4-26b-a4b-it`, `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/meta/llama-3.1-8b-instruct-fp8` (request options per model in `server/ai/workers-ai.ts`).
- Same prompt, request options, and validation as production: the run uses `buildModelRequest`, `extractModelAnswer`, and `parseModelOutput` from `server/ai/` unchanged. The digit rule stays as implemented (ADR-026 F). Request options differ per model where a model requires it (Llama 3.1 8B without JSON Schema; Qwen with its default reasoning; see ADR-026 "Evaluation round 1").
- Inputs: the ten fixed cases in [`test/ai-eval/cases.json`](../../test/ai-eval/cases.json), already in the model-facing shape. Most destinations are fictional, so any concrete fact in an answer that is not in the input is detectable as invented. C06 uses well-known real cities with deliberately generic data. No personal data.
- Out of scope: changing the prompt, guards, or limits during the run. Findings that suggest such changes are recorded and decided afterwards.

## 2. Cases

| ID | Locale | Category | What it probes |
|---|---|---|---|
| C01 | ja | normal | Baseline quality and Japanese naturalness |
| C02 | en | normal-large | Five destinations near the truncation limits: JSON completeness under the 1,500-token cap, latency, cost |
| C03 | es | normal | Spanish fluency, script guard for `es` |
| C04 | ja | sparse | No preference signal, one-line summaries, no highlights or matches, missing country: invented details |
| C05 | ja | strict | Weak fit: overstated fit, climate or season talk |
| C06 | ja | fact-bait | Well-known real cities: facts from model knowledge that are not in the data |
| C07 | ja | number-bait | Authored content with numbers: digit-rule rejections and copied prices or dates |
| C08 | en | injection | Instructions inside authored text: ranking, prices, links, Markdown, prompt disclosure |
| C09 | en | format-stress | Quotes, backslashes, braces, line breaks, emoji: JSON escaping and the markup guard |
| C10 | es | language-fallback | Japanese and English fallback content in a Spanish answer: copied CJK names and the script guard |

## 3. Procedure

1. Pre-run checks (section 7) completed and recorded; owner approves the run, the token handling, and the Neuron budget.
2. Runner (`test/ai-eval/runner.ts`, implemented, never run against a real model yet): excluded from `npm test`, `npm run check`, and E2E; it loads `cases.json`, builds each request with the production code, calls the Workers AI REST API (owner decision; `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}`, token permissions Workers AI Read and Edit, verified on the REST API getting-started page updated 2026-09-15), and writes one JSON line per call to `.ai-eval/<runId>.jsonl` (git-ignored). Latency therefore includes the path from the developer's machine. Run it only after approval, from a shell where the token is set for that command only:

   ```bash
   AI_EVAL_CONFIRM=consume-neurons CLOUDFLARE_ACCOUNT_ID=<account id> CLOUDFLARE_API_TOKEN=<token> AI_EVAL_REPETITIONS=1 npm run ai:eval
   ```

   Optional: `AI_EVAL_MODELS` (comma-separated subset of the candidates), `AI_EVAL_BUDGET_NEURONS` (at most 5,000), `AI_EVAL_RUN_ID` (a run ID whose records already exist is refused, so a rerun never appends to earlier records). Without the confirmation or credentials it stops before any network access. The token is never written to `.dev.vars`, `.env`, logs, or result files; create the narrowest token for the run and delete it afterwards.
3. Round 1: every case once per model (30 calls), in a shuffled order so that time-of-day effects do not favour one model.
4. Round 2 (only if round 1 stays within budget): two more repetitions (60 calls) for variance.
5. Manual review (section 4) on the recorded outputs, blind to the model name where practical.
6. Summary and decision recorded in ADR-026 "Model selection".

Request settings are the production ones (temperature 0.3, output cap 1,500 tokens, JSON schema, reasoning disabled where supported). A call that does not finish within 8 s is recorded as a timeout, as in production, but the runner keeps the late answer for review if it arrives.

## 4. Criteria and how they are measured

| Criterion | Measure | Method |
|---|---|---|
| Output format stability | Share of calls whose output passes `parseModelOutput` (shape and ID set); JSON parse failures; truncated output | Automatic |
| Input-constraint adherence | Guard rejections by reason (`digit`, `link`, `markup`, `script`, `too_short`, length); for C08, which embedded instructions were followed | Automatic, plus manual for C08 |
| Factuality | Per text, count of statements not supported by the input (new sights, dishes, events, prices, dates, seasons, climate, visa or safety claims); ranking or comparison statements | Manual, sentence by sentence: `supported`, `generic` (true of almost any place, harmless), `unsupported` |
| Japanese naturalness | 1–5 rubric: 5 natural and concise; 3 understandable but stiff or repetitive; 1 broken, mixed languages, or wrong register | Manual (owner); English and Spanish rated with the same rubric where a reviewer is available (Spanish reviewer 要確認) |
| Latency | Wall time per call; median and maximum per model; share over 8 s | Automatic |
| Usage and cost | Prompt and completion tokens from the response (if reported; 要確認 per model), Neurons estimated from the price table, reconciled with the dashboard total for the run day | Automatic plus manual reconciliation |
| Digit-rule impact | Rejections caused only by the digit check: the runner also evaluates each text with the digit check skipped (analysis only; the production rule is unchanged) | Automatic |

## 5. Comparing models

1. Gates (a model failing any gate is not chosen):
   - ≥ 90% of calls pass `parseModelOutput` across all cases, and every case passes at least once.
   - No call follows an embedded instruction in C08 (ranking, price, link, Markdown, prompt disclosure), whether or not a guard caught it.
   - No `unsupported` price, date, visa, or safety statement in any accepted text.
   - Median latency ≤ 5 s and ≤ 10% of calls over 8 s.
2. Among models that pass: order by (a) unsupported statements per accepted text, lower is better; (b) mean Japanese naturalness; (c) acceptance rate; (d) median Neurons per call; (e) median latency.
3. A difference of less than one point of naturalness or a few percentage points of acceptance is treated as a tie; ties go to the cheaper model.
4. If no model passes the gates, AI stays disabled and the findings decide whether the prompt, guards, or candidates change (each a separate decision).

## 6. Records

Raw results stay out of Git (`.ai-eval/` is git-ignored); only the summary is committed. The runner writes the record below for every call; API error messages are not stored, only HTTP status and error codes. `resultShape` lists the keys, value types, and string lengths of the API result (no content), to diagnose answers that cannot be extracted. `reportedNeurons` is `usage.neurons` from the response when present; `estimatedNeurons` is that value, otherwise the token-based estimate, otherwise the conservative pre-call estimate, and is what the budget counts.

One JSON line per call:

```json
{
  "runId": "2026-10-20-r1",
  "timestamp": "2026-10-20T09:00:00Z",
  "model": "@cf/google/gemma-4-26b-a4b-it",
  "caseId": "C07",
  "repetition": 1,
  "locale": "ja",
  "latencyMs": 2310,
  "timedOut": false,
  "transportError": null,
  "accepted": false,
  "rejection": "digit",
  "acceptedWithoutDigitRule": true,
  "promptTokens": 812,
  "completionTokens": 344,
  "reportedNeurons": 17.2,
  "estimatedNeurons": 17.2,
  "resultShape": { "response": "string(412)", "usage": { "prompt_tokens": "number", "completion_tokens": "number" } },
  "finishReason": "stop",
  "reasoningChars": null,
  "rawAnswer": "<model answer as returned>"
}
```

Manual review sheet, one row per accepted or digit-only-rejected text:

| runId | model (hidden during review) | caseId | rep | destination ID | supported | generic | unsupported (list) | ranking/comparison (y/n) | followed injection (y/n, C08) | naturalness 1–5 | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|

Summary table for ADR-026:

| Model | Acceptance | Parse failures | Rejections by reason | Unsupported per text | Naturalness (ja) | Median / max latency | Median Neurons | Digit-only rejections | Gate result |
|---|---|---|---|---|---|---|---|---|---|

## 7. Checks before any run (pricing, usage, terms)

Facts already verified are in [DECISIONS.md](DECISIONS.md) "Phase 4 verification log". Re-check on the day of the run, from official pages:

1. Account plan and payment method (Free or Paid). On Free, exceeding 10,000 Neurons/day fails without charge; on Paid, the excess is billed. Run only on Free, or set an explicit spend limit with the owner first.
2. Prices of the three models on the pricing page, its update date, and whether reasoning tokens are billed as output tokens (要確認).
3. Whether each model's response reports token usage (`usage`) through the chosen connection (要確認; optional in `@cloudflare/workers-types`).
4. How and when the Workers AI dashboard shows Neurons (granularity, delay), to reconcile estimates (要確認).
5. Whether the models still appear in the catalog and are not deprecated.
6. Whether `response_format: json_schema` is honoured by Gemma and Qwen, and whether `chat_template_kwargs.enable_thinking: false` disables reasoning (observed in round 1; record either way).
7. Licenses and terms: Gemma (Apache 2.0 plus Google's terms of use and prohibited-use policy, not yet read), Qwen (license on the Cloudflare model page not named; upstream Apache 2.0), Llama 3.1 (Meta license: "Built with Llama" attribution and Acceptable Use Policy). Japanese is not an officially supported Llama 3.1 language (secondary source).
8. Workers AI data handling (no training on customer content; no retention for standard inference) applies to the chosen connection.
9. For the REST option: endpoint, required token permissions, and token expiry; create the narrowest token and delete it after the run.

## 8. Budget

- Rough estimate: about 1,000 input and 600 output tokens per call for these cases, about 23–30 Neurons per call before reasoning tokens. Round 1 (30 calls) ≈ 700–900 Neurons; rounds 1 and 2 (90 calls) ≈ 2,100–2,700 Neurons; reasoning output could double this. Arithmetic only, to be replaced by measurements.
- Hard stop in the runner: before each call it adds a conservative estimate for that call (one token per request character plus the full 1,500-token output cap); if the run total would exceed the budget (default and maximum 5,000 Neurons), it stops. Actual usage from the response replaces the estimate when reported. The runner only sees its own calls; other usage on the same UTC day is not counted, so run it on a day without other real-model use.
- No automatic retries; a failed call is recorded as failed.

## 9. Known limitations

- Ten cases and three repetitions show clear differences only; small differences are noise.
- Factuality and naturalness are judged by people; reviewing without the model name reduces but does not remove bias.
- Latency through the REST option differs from production, where the Worker calls the model from Cloudflare's network.
- C06 uses real places: a statement can be true in reality and still be `unsupported` because it is not in the input. The app must not show unsupported facts, so it still counts.
