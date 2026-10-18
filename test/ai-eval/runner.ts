/**
 * Opt-in model evaluation runner (docs/AI_EVALUATION.md, docs/DECISIONS.md
 * ADR-026 C6). It calls the Workers AI REST API with the production request
 * builder and validation, so every call consumes Neurons. It never runs in
 * `npm test`, `npm run check`, or E2E; it refuses to start without an explicit
 * confirmation and credentials, never retries, and stops at a Neuron budget.
 * Credentials come from the shell environment only and are never recorded.
 */
import { checkExplanationText, parseModelOutput, type TextRejection } from "../../server/ai/output";
import type { ExplanationInput } from "../../server/ai/provider";
import { buildModelRequest, extractModelAnswer, MAX_OUTPUT_TOKENS, MODEL_PROFILES } from "../../server/ai/workers-ai";
import { MAX_EXPLANATION_LENGTH } from "../../shared/ai-explanation";

export const CONFIRMATION = "consume-neurons";
/** Production server timeout; slower answers are recorded as timed out but kept for review. */
export const PRODUCTION_TIMEOUT_MS = 8_000;
export const HARD_TIMEOUT_MS = 60_000;
export const DEFAULT_BUDGET_NEURONS = 5_000;

/**
 * Neurons per million tokens (input, output) from docs/DECISIONS.md "Phase 4
 * verification log" (pricing page updated 2026-10-15). Re-check before a run.
 */
export const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  "@cf/meta/llama-3.1-8b-instruct-fp8": { input: 13_778, output: 26_128 },
  "@cf/google/gemma-4-26b-a4b-it": { input: 9_091, output: 27_273 },
  "@cf/qwen/qwen3-30b-a3b-fp8": { input: 4_625, output: 30_475 },
};

export const EVALUATION_MODELS = Object.keys(PRICES);

export interface EvaluationCase {
  id: string;
  input: ExplanationInput;
}

export interface EvalConfig {
  accountId: string;
  apiToken: string;
  models: readonly string[];
  repetitions: number;
  budgetNeurons: number;
  runId: string;
}

/** Validates the opt-in settings; throws before any network access when something is missing. */
export function readEvalConfig(env: Readonly<Record<string, string | undefined>>, now: Date): EvalConfig {
  if (env.AI_EVAL_CONFIRM !== CONFIRMATION) {
    throw new Error(`Refusing to run: set AI_EVAL_CONFIRM=${CONFIRMATION} to call real models and consume Neurons.`);
  }
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const apiToken = env.CLOUDFLARE_API_TOKEN ?? "";
  if (!/^[0-9a-f]{32}$/.test(accountId) || apiToken === "") {
    throw new Error("Refusing to run: CLOUDFLARE_ACCOUNT_ID (32 hex characters) and CLOUDFLARE_API_TOKEN must be set in the shell.");
  }
  const models = (env.AI_EVAL_MODELS ?? EVALUATION_MODELS.join(",")).split(",").map((model) => model.trim());
  for (const model of models) {
    if (!EVALUATION_MODELS.includes(model)) {
      throw new Error(`Refusing to run: ${model} is not an evaluation candidate.`);
    }
  }
  const repetitions = Number(env.AI_EVAL_REPETITIONS ?? "1");
  const budgetNeurons = Number(env.AI_EVAL_BUDGET_NEURONS ?? String(DEFAULT_BUDGET_NEURONS));
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3) {
    throw new Error("Refusing to run: AI_EVAL_REPETITIONS must be 1, 2, or 3.");
  }
  if (!Number.isFinite(budgetNeurons) || budgetNeurons <= 0 || budgetNeurons > DEFAULT_BUDGET_NEURONS) {
    throw new Error(`Refusing to run: AI_EVAL_BUDGET_NEURONS must be above 0 and at most ${String(DEFAULT_BUDGET_NEURONS)}.`);
  }
  const runId = env.AI_EVAL_RUN_ID ?? now.toISOString().replace(/[:.]/g, "-");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
    throw new Error("Refusing to run: AI_EVAL_RUN_ID may contain only letters, digits, - and _.");
  }
  return { accountId, apiToken, models, repetitions, budgetNeurons, runId };
}

export interface Job {
  model: string;
  caseId: string;
  repetition: number;
  input: ExplanationInput;
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (const char of text) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  return hash;
}

/** Every model × case × repetition, shuffled deterministically by run ID so no model is favoured by call order. */
export function buildJobs(cases: readonly EvaluationCase[], models: readonly string[], repetitions: number, runId: string): Job[] {
  const jobs: Job[] = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const item of cases) {
      for (const model of models) {
        jobs.push({ model, caseId: item.id, repetition, input: item.input });
      }
    }
  }
  let state = seedFrom(runId);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let index = jobs.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [jobs[index], jobs[other]] = [jobs[other] as Job, jobs[index] as Job];
  }
  return jobs;
}

export function estimateNeurons(model: string, promptTokens: number, completionTokens: number): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price for ${model}`);
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

/**
 * Conservative pre-call estimate: one token per character of the request
 * (Japanese text can need a token or more per character) and the full output
 * cap.
 */
export function worstCaseNeurons(model: string, requestBody: string): number {
  return estimateNeurons(model, requestBody.length, MAX_OUTPUT_TOKENS);
}

/** Refuses to reuse a run ID, so a rerun never mixes with or appends to earlier records. */
export function assertNewRun(recordsExist: boolean, runId: string): void {
  if (recordsExist) {
    throw new Error(`Refusing to run: records for AI_EVAL_RUN_ID=${runId} already exist; choose a new run ID.`);
  }
}

export type Rejection = "structure" | "too_long" | TextRejection;

function toJson(answer: unknown): unknown {
  if (typeof answer !== "string") return answer;
  try {
    return JSON.parse(answer);
  } catch {
    return undefined;
  }
}

function explanationItems(answer: unknown): { id: unknown; text: unknown }[] | null {
  const value = toJson(answer);
  if (typeof value !== "object" || value === null || !("explanations" in value)) return null;
  const items: unknown = value.explanations;
  if (!Array.isArray(items)) return null;
  return items.map((item: unknown) =>
    typeof item === "object" && item !== null ? { id: (item as { id?: unknown }).id, text: (item as { text?: unknown }).text } : { id: undefined, text: undefined },
  );
}

/**
 * Production acceptance plus a reason for rejection, and whether the answer
 * would pass with digits masked (analysis only; the production rule is
 * unchanged, docs/DECISIONS.md ADR-026 F).
 */
export function analyzeAnswer(
  answer: unknown,
  ids: readonly string[],
  locale: ExplanationInput["locale"],
): { accepted: boolean; rejection: Rejection | null; acceptedWithoutDigitRule: boolean } {
  const accepted = parseModelOutput(answer, ids, locale) !== null;
  const items = explanationItems(answer);
  let rejection: Rejection | null = null;
  if (!accepted) {
    rejection = "structure";
    if (items?.every((item) => typeof item.text === "string")) {
      for (const item of items) {
        const text = (item.text as string).trim();
        const reason: Rejection | null = text.length > MAX_EXPLANATION_LENGTH ? "too_long" : checkExplanationText(text, locale);
        if (reason) {
          rejection = reason;
          break;
        }
      }
    }
  }
  let acceptedWithoutDigitRule = accepted;
  if (rejection === "digit" && items) {
    const masked = { explanations: items.map((item) => ({ id: item.id, text: String(item.text).replace(/\p{Nd}/gu, "X") })) };
    acceptedWithoutDigitRule = parseModelOutput(masked, ids, locale) !== null;
  }
  return { accepted, rejection, acceptedWithoutDigitRule };
}

const SHAPE_DEPTH = 5;

/**
 * Keys, value types, and string lengths of a response, without any content,
 * so an unexpected shape can be diagnosed without storing more text.
 */
export function describeShape(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (typeof value === "string") return `string(${String(value.length)})`;
  if (typeof value !== "object") return typeof value;
  if (depth >= SHAPE_DEPTH) return Array.isArray(value) ? "array" : "object";
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.length === 0 ? [] : [describeShape(items[0], depth + 1), `length ${String(items.length)}`];
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, describeShape(item, depth + 1)]));
}

export interface EvalRecord {
  runId: string;
  timestamp: string;
  model: string;
  caseId: string;
  repetition: number;
  locale: string;
  latencyMs: number | null;
  timedOut: boolean;
  transportError: string | null;
  accepted: boolean;
  rejection: Rejection | null;
  acceptedWithoutDigitRule: boolean;
  usageReported: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedNeurons: number;
  /** Structure of the API `result` (keys, types, string lengths only); null on transport errors. */
  resultShape: unknown;
  rawAnswer: unknown;
}

interface Envelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
}

function usageOf(result: unknown): { prompt: number; completion: number } | null {
  if (typeof result !== "object" || result === null || !("usage" in result)) return null;
  const usage = result.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
  return typeof usage?.prompt_tokens === "number" && typeof usage.completion_tokens === "number"
    ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens }
    : null;
}

function errorCodes(errors: unknown): string {
  if (!Array.isArray(errors)) return "unknown";
  const codes = errors.map((error: unknown) => (typeof error === "object" && error !== null && "code" in error ? String(error.code) : "?"));
  return codes.length > 0 ? codes.join(",") : "unknown";
}

export interface RunDependencies {
  fetchImpl: typeof fetch;
  now: () => number;
  clock: () => Date;
  write: (record: EvalRecord) => void;
}

export interface RunSummary {
  completed: number;
  stoppedForBudget: boolean;
  estimatedNeurons: number;
}

/** Runs the jobs sequentially, one call each, until done or the budget would be exceeded. */
export async function runEvaluation(config: EvalConfig, jobs: readonly Job[], deps: RunDependencies): Promise<RunSummary> {
  let spent = 0;
  let completed = 0;
  for (const job of jobs) {
    const profile = MODEL_PROFILES[job.model];
    if (!profile) throw new Error(`Unknown model ${job.model}`);
    const body = JSON.stringify(buildModelRequest(profile, job.input));
    if (spent + worstCaseNeurons(job.model, body) > config.budgetNeurons) {
      return { completed, stoppedForBudget: true, estimatedNeurons: spent };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, HARD_TIMEOUT_MS);
    const started = deps.now();
    let latencyMs: number | null = null;
    let transportError: string | null = null;
    let envelope: Envelope | null = null;
    try {
      const response = await deps.fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${job.model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        },
      );
      const parsed: unknown = await response.json().catch(() => null);
      latencyMs = Math.round(deps.now() - started);
      envelope = typeof parsed === "object" && parsed !== null ? parsed : null;
      if (!response.ok || envelope?.success !== true) {
        transportError = `http_${String(response.status)}:${errorCodes(envelope?.errors)}`;
      }
    } catch {
      transportError = controller.signal.aborted ? "hard_timeout" : "network";
    } finally {
      clearTimeout(timer);
    }

    const ids = job.input.destinations.map((item) => item.id);
    const answer = transportError ? undefined : extractModelAnswer(envelope?.result);
    const analysis = transportError
      ? { accepted: false, rejection: null, acceptedWithoutDigitRule: false }
      : analyzeAnswer(answer, ids, job.input.locale);
    const usage = transportError ? null : usageOf(envelope?.result);
    const estimatedNeurons = usage ? estimateNeurons(job.model, usage.prompt, usage.completion) : worstCaseNeurons(job.model, body);
    spent += estimatedNeurons;
    completed += 1;
    deps.write({
      runId: config.runId,
      timestamp: deps.clock().toISOString(),
      model: job.model,
      caseId: job.caseId,
      repetition: job.repetition,
      locale: job.input.locale,
      latencyMs,
      timedOut: transportError === "hard_timeout" || (latencyMs !== null && latencyMs > PRODUCTION_TIMEOUT_MS),
      transportError,
      ...analysis,
      usageReported: usage !== null,
      promptTokens: usage?.prompt ?? null,
      completionTokens: usage?.completion ?? null,
      estimatedNeurons: Math.round(estimatedNeurons * 10) / 10,
      resultShape: transportError ? null : describeShape(envelope?.result),
      rawAnswer: answer ?? null,
    });
  }
  return { completed, stoppedForBudget: false, estimatedNeurons: spent };
}
