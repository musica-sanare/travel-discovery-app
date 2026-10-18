/**
 * Workers AI adapter (docs/DECISIONS.md ADR-026). Only models from the
 * evaluated shortlist are accepted, because request options and output shapes
 * differ between them; any other model ID leaves AI unavailable. The adapter
 * extracts the model's answer but does not trust it: the use case validates it.
 */
import { buildMessages, responseJsonSchema } from "./prompt";
import type { ExplanationInput, ExplanationProvider } from "./provider";

/** The part of the `AI` binding the adapter uses (a fake in tests). */
export interface AiRunner {
  run(model: string, inputs: Record<string, unknown>, options: { signal: AbortSignal }): Promise<unknown>;
}

/** Output token cap: five paragraphs of up to about 200 characters plus JSON overhead. */
export const MAX_OUTPUT_TOKENS = 1_500;

interface ModelProfile {
  tokenLimitParameter: "max_tokens" | "max_completion_tokens";
  /** Asks reasoning models to skip reasoning (`chat_template_kwargs.enable_thinking`). */
  disableThinking: boolean;
  /** Sends `response_format: json_schema`; models that reject it get the schema only through the prompt. */
  jsonSchema: boolean;
}

/**
 * Shortlist from the Phase 4 verification log. Observed in evaluation probes
 * (2026-10-18, docs/DECISIONS.md ADR-026 "Evaluation round 1"):
 * `llama-3.1-8b-instruct-fp8` rejects JSON Schema (403, code 5025), and
 * `qwen3-30b-a3b-fp8` with `enable_thinking: false` returns its answer only in
 * reasoning fields, so it keeps its default reasoning. `llama-3.3-70b` is not
 * evaluated; its settings are unverified.
 */
export const MODEL_PROFILES: Readonly<Record<string, ModelProfile>> = {
  "@cf/meta/llama-3.1-8b-instruct-fp8": { tokenLimitParameter: "max_tokens", disableThinking: false, jsonSchema: false },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { tokenLimitParameter: "max_tokens", disableThinking: false, jsonSchema: true },
  "@cf/google/gemma-4-26b-a4b-it": { tokenLimitParameter: "max_completion_tokens", disableThinking: true, jsonSchema: true },
  "@cf/qwen/qwen3-30b-a3b-fp8": { tokenLimitParameter: "max_tokens", disableThinking: false, jsonSchema: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Returns the model's answer from the known output shapes: `{ response }`
 * (text generation), `{ choices: [{ message: { content } }] }` (chat
 * completions), or `{ choices: [{ text }] }` (text completions). A `response`
 * key that is null or missing falls through to `choices`, because some models
 * return both. Reasoning output (`reasoning_content`) is never used as the
 * answer. Anything else yields undefined, which fails validation.
 */
export function extractModelAnswer(output: unknown): unknown {
  if (typeof output === "string") {
    return output;
  }
  if (!isRecord(output)) {
    return undefined;
  }
  if (isPresent(output.response)) {
    return output.response;
  }
  const choices = output.choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (!isRecord(first)) {
    return undefined;
  }
  const message = first.message;
  if (isRecord(message) && isPresent(message.content)) {
    return message.content;
  }
  return isPresent(first.text) ? first.text : undefined;
}

export function buildModelRequest(profile: ModelProfile, input: ExplanationInput): Record<string, unknown> {
  const ids = input.destinations.map((item) => item.id);
  return {
    messages: buildMessages(input),
    ...(profile.jsonSchema ? { response_format: { type: "json_schema", json_schema: responseJsonSchema(ids) } } : {}),
    temperature: 0.3,
    [profile.tokenLimitParameter]: MAX_OUTPUT_TOKENS,
    ...(profile.disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  };
}

/** Returns null when the model is not on the shortlist. */
export function createWorkersAiProvider(runner: AiRunner, model: string): ExplanationProvider | null {
  const profile = Object.hasOwn(MODEL_PROFILES, model) ? MODEL_PROFILES[model] : undefined;
  if (!profile) {
    return null;
  }
  return {
    model,
    async explain(input, signal) {
      return extractModelAnswer(await runner.run(model, buildModelRequest(profile, input), { signal }));
    },
  };
}
