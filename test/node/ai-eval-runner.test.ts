/**
 * The opt-in evaluation runner with a fake fetch: no network, no Neurons.
 * Covers the refusal gates, budget stop, no retries, and what is recorded.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExplanationInput } from "../../server/ai/provider";
import {
  analyzeAnswer,
  assertNewRun,
  completionDetails,
  describeShape,
  buildJobs,
  CONFIRMATION,
  estimateNeurons,
  EVALUATION_MODELS,
  worstCaseNeurons,
  readEvalConfig,
  runEvaluation,
  type EvalConfig,
  type EvalRecord,
  type EvaluationCase,
} from "../ai-eval/runner";

const root = path.resolve(import.meta.dirname, "../..");
const { cases } = JSON.parse(readFileSync(path.join(root, "test/ai-eval/cases.json"), "utf8")) as { cases: EvaluationCase[] };
const NOW = new Date("2026-10-20T09:00:00Z");
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "test-token-never-recorded";
const JA = "ゆったりとした街歩きと豊かな食文化があり、あなたが挙げた好みによく合いそうな旅行先です。";

function urlOf(input: Parameters<typeof fetch>[0] | undefined): string {
  if (input === undefined) return "";
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

const VALID_ENV = { AI_EVAL_CONFIRM: CONFIRMATION, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: TOKEN };

describe("readEvalConfig", () => {
  it("defaults to all candidates, one repetition, and the 5,000-Neuron budget", () => {
    expect(readEvalConfig(VALID_ENV, NOW)).toEqual({
      accountId: ACCOUNT,
      apiToken: TOKEN,
      models: EVALUATION_MODELS,
      repetitions: 1,
      budgetNeurons: 5000,
      runId: "2026-10-20T09-00-00-000Z",
    });
  });

  it.each([
    ["no confirmation", { ...VALID_ENV, AI_EVAL_CONFIRM: undefined }],
    ["a wrong confirmation", { ...VALID_ENV, AI_EVAL_CONFIRM: "yes" }],
    ["no token", { ...VALID_ENV, CLOUDFLARE_API_TOKEN: undefined }],
    ["a malformed account ID", { ...VALID_ENV, CLOUDFLARE_ACCOUNT_ID: "abc" }],
    ["a model outside the candidates", { ...VALID_ENV, AI_EVAL_MODELS: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }],
    ["too many repetitions", { ...VALID_ENV, AI_EVAL_REPETITIONS: "4" }],
    ["a budget above 5,000", { ...VALID_ENV, AI_EVAL_BUDGET_NEURONS: "9000" }],
    ["an unsafe run ID", { ...VALID_ENV, AI_EVAL_RUN_ID: "../x" }],
  ])("refuses to run with %s", (_, env) => {
    expect(() => readEvalConfig(env, NOW)).toThrow(/Refusing to run/);
  });
});

describe("budget estimates and run IDs", () => {
  it("estimates one token per request character plus the full output cap before a call", () => {
    const body = "あ".repeat(1000);
    expect(worstCaseNeurons("@cf/qwen/qwen3-30b-a3b-fp8", body)).toBe(estimateNeurons("@cf/qwen/qwen3-30b-a3b-fp8", 1000, 1500));
  });

  it("refuses a run ID whose records already exist", () => {
    expect(() => {
      assertNewRun(true, "r1");
    }).toThrow(/Refusing to run: records for AI_EVAL_RUN_ID=r1 already exist/);
    expect(() => {
      assertNewRun(false, "r1");
    }).not.toThrow();
  });
});

describe("describeShape", () => {
  it("keeps keys, types, and string lengths but no content", () => {
    const result = {
      response: null,
      choices: [{ message: { role: "assistant", content: null, reasoning_content: "secret reasoning text" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    const shape = describeShape(result);
    expect(shape).toEqual({
      response: "null",
      choices: [{ message: { role: "string(9)", content: "null", reasoning_content: "string(21)" } }, "length 1"],
      usage: { prompt_tokens: "number", completion_tokens: "number" },
    });
    expect(JSON.stringify(shape)).not.toContain("secret");
  });
});

describe("completionDetails", () => {
  it.each([
    [{ choices: [{ finish_reason: "length", message: { content: "{}", reasoning_content: "abcd" } }] }, { finishReason: "length", reasoningChars: 4 }],
    [{ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }, { finishReason: "stop", reasoningChars: null }],
    [{ choices: [{ finish_reason: "Not a reason value!", message: {} }] }, { finishReason: null, reasoningChars: null }],
    [{ response: "{}" }, { finishReason: null, reasoningChars: null }],
    [null, { finishReason: null, reasoningChars: null }],
  ])("reads %o", (result, expected) => {
    expect(completionDetails(result)).toEqual(expected);
  });
});

describe("buildJobs", () => {
  it("covers every model, case, and repetition once, in a run-specific deterministic order", () => {
    const jobs = buildJobs(cases, EVALUATION_MODELS, 2, "run-a");
    expect(jobs).toHaveLength(cases.length * EVALUATION_MODELS.length * 2);
    expect(new Set(jobs.map((job) => `${job.model}|${job.caseId}|${String(job.repetition)}`)).size).toBe(jobs.length);
    expect(buildJobs(cases, EVALUATION_MODELS, 2, "run-a")).toEqual(jobs);
    expect(buildJobs(cases, EVALUATION_MODELS, 2, "run-b").map((job) => job.caseId)).not.toEqual(jobs.map((job) => job.caseId));
  });
});

describe("analyzeAnswer", () => {
  const destination = (id: string) => ({ id, name: "ソルナ島", country: null, summary: "静かな島。", highlights: [] });
  const input: ExplanationInput = { locale: "ja", preferences: [], destinations: [destination("d1"), destination("d2")] };
  const answer = (texts: string[]) => JSON.stringify({ explanations: texts.map((text, index) => ({ id: `d${String(index + 1)}`, text })) });

  it.each([
    ["an accepted answer", answer([JA, JA]), { accepted: true, rejection: null, acceptedWithoutDigitRule: true }],
    ["a digit-only rejection", answer([JA, `${JA}標高２３００ｍです。`]), { accepted: false, rejection: "digit", acceptedWithoutDigitRule: true }],
    ["digits plus a link", answer([JA, `${JA}https://x.example 1`]), { accepted: false, rejection: "digit", acceptedWithoutDigitRule: false }],
    ["a markup rejection", answer([JA, `${JA}**おすすめ**`]), { accepted: false, rejection: "markup", acceptedWithoutDigitRule: false }],
    ["text over the length limit", answer([JA, "あ".repeat(401)]), { accepted: false, rejection: "too_long", acceptedWithoutDigitRule: false }],
    ["a missing ID", answer([JA]), { accepted: false, rejection: "structure", acceptedWithoutDigitRule: false }],
    ["broken JSON", "{\"explanations\": [", { accepted: false, rejection: "structure", acceptedWithoutDigitRule: false }],
  ])("reports %s", (_, value, expected) => {
    expect(analyzeAnswer(value, input)).toEqual(expected);
  });
});

describe("runEvaluation", () => {
  const config: EvalConfig = { accountId: ACCOUNT, apiToken: TOKEN, models: EVALUATION_MODELS, repetitions: 1, budgetNeurons: 5000, runId: "test-run" };
  const firstCase = cases.slice(0, 1);

  function fakeFetch(respond: (url: string, body: { messages: unknown[] }) => Response | Promise<Response>) {
    return vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(respond(urlOf(input), JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { messages: unknown[] })),
    );
  }

  function echo(body: { messages: unknown[] }, neurons?: number) {
    const data = JSON.parse(String((body.messages[1] as { content: string }).content.split("<data>\n")[1]?.split("\n</data>")[0])) as {
      destinations: { id: string }[];
    };
    const response = JSON.stringify({ explanations: data.destinations.map((item) => ({ id: item.id, text: JA })) });
    const usage = { prompt_tokens: 900, completion_tokens: 300, ...(neurons === undefined ? {} : { neurons }) };
    return Response.json({ success: true, result: { response, usage } });
  }

  async function run(fetchImpl: typeof fetch, overrides: Partial<EvalConfig> = {}) {
    const records: EvalRecord[] = [];
    let tick = 0;
    const summary = await runEvaluation({ ...config, ...overrides }, buildJobs(firstCase, config.models, 1, "test-run"), {
      fetchImpl,
      now: () => (tick += 1500),
      clock: () => NOW,
      write: (record) => records.push(record),
    });
    return { records, summary };
  }

  it("calls the REST endpoint once per job with the production request and records usage-based Neurons", async () => {
    const fetchImpl = fakeFetch((_url, body) => echo(body));
    const { records, summary } = await run(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(EVALUATION_MODELS.length);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(urlOf(url)).toMatch(new RegExp(`^https://api\\.cloudflare\\.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/`));
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(records.every((record) => record.accepted && record.usageReported && record.latencyMs === 1500)).toBe(true);
    const answer = String(records[0]?.rawAnswer);
    expect(records[0]?.resultShape).toEqual({
      response: `string(${String(answer.length)})`,
      usage: { prompt_tokens: "number", completion_tokens: "number" },
    });
    const gemma = records.find((record) => record.model === "@cf/google/gemma-4-26b-a4b-it");
    expect(gemma?.estimatedNeurons).toBe(Math.round(estimateNeurons("@cf/google/gemma-4-26b-a4b-it", 900, 300) * 10) / 10);
    expect(summary.stoppedForBudget).toBe(false);
    // The token never appears in any record.
    expect(JSON.stringify(records)).not.toContain(TOKEN);
  });

  it("uses Neurons reported in usage.neurons for the record and the budget", async () => {
    const fetchImpl = fakeFetch((_url, body) => echo(body, 0.75));
    const { records, summary } = await run(fetchImpl);
    expect(records.every((record) => record.reportedNeurons === 0.75 && record.estimatedNeurons === 0.8)).toBe(true);
    expect(summary.estimatedNeurons).toBeCloseTo(0.75 * EVALUATION_MODELS.length);
  });

  it("records transport and API errors without retrying and with a conservative Neuron estimate", async () => {
    const fetchImpl = fakeFetch(() => Response.json({ success: false, errors: [{ code: 3036, message: "secret detail" }] }, { status: 429 }));
    const { records } = await run(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(EVALUATION_MODELS.length);
    expect(records.map((record) => record.transportError)).toEqual(EVALUATION_MODELS.map(() => "http_429:3036"));
    expect(records.every((record) => !record.accepted && record.estimatedNeurons > 0)).toBe(true);
    expect(JSON.stringify(records)).not.toContain("secret detail");
  });

  it("stops before a call that could exceed the budget", async () => {
    const fetchImpl = fakeFetch((_url, body) => echo(body));
    const { records, summary } = await run(fetchImpl, { budgetNeurons: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(records).toEqual([]);
    expect(summary.stoppedForBudget).toBe(true);
  });
});
