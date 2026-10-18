/** Workers AI adapter with a fake binding; no real model is called. */
import { describe, expect, it } from "vitest";
import type { ExplanationInput } from "../../server/ai/provider";
import {
  buildModelRequest,
  createWorkersAiProvider,
  extractModelAnswer,
  MAX_OUTPUT_TOKENS,
  MODEL_PROFILES,
  type AiRunner,
} from "../../server/ai/workers-ai";

const INPUT: ExplanationInput = {
  locale: "ja",
  preferences: ["食"],
  destinations: [{ id: "d1", name: "リスボン", country: "ポルトガル", summary: "海辺の街", highlights: [], matches: ["食"] }],
};

function fakeRunner(output: unknown) {
  const calls: { model: string; inputs: Record<string, unknown>; signal: AbortSignal }[] = [];
  const runner: AiRunner = {
    run(model, inputs, options) {
      calls.push({ model, inputs, signal: options.signal });
      return Promise.resolve(output);
    },
  };
  return { runner, calls };
}

describe("extractModelAnswer", () => {
  it.each([
    ["a text-generation string response", { response: '{"explanations":[]}' }, '{"explanations":[]}'],
    ["a text-generation object response", { response: { explanations: [] } }, { explanations: [] }],
    ["a chat-completions response", { choices: [{ message: { content: "{}" } }] }, "{}"],
    ["a plain string", "{}", "{}"],
    ["an unknown shape", { output: "x" }, undefined],
    ["empty choices", { choices: [] }, undefined],
    ["null", null, undefined],
  ])("handles %s", (_, output, expected) => {
    expect(extractModelAnswer(output)).toEqual(expected);
  });
});

describe("buildModelRequest", () => {
  it("uses max_tokens and no thinking switch for Llama", () => {
    const request = buildModelRequest(MODEL_PROFILES["@cf/meta/llama-3.1-8b-instruct-fp8"] ?? expect.fail(), INPUT);
    expect(request.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(request).not.toHaveProperty("max_completion_tokens");
    expect(request).not.toHaveProperty("chat_template_kwargs");
    expect(request.response_format).toMatchObject({ type: "json_schema" });
    expect(request.messages).toHaveLength(2);
  });

  it("uses max_completion_tokens and disables thinking for Gemma", () => {
    const request = buildModelRequest(MODEL_PROFILES["@cf/google/gemma-4-26b-a4b-it"] ?? expect.fail(), INPUT);
    expect(request.max_completion_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(request).not.toHaveProperty("max_tokens");
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

describe("createWorkersAiProvider", () => {
  it("returns null for models outside the shortlist", () => {
    const { runner } = fakeRunner({});
    expect(createWorkersAiProvider(runner, "@cf/meta/llama-2-7b-chat-fp16")).toBeNull();
    expect(createWorkersAiProvider(runner, "toString")).toBeNull();
    expect(createWorkersAiProvider(runner, "")).toBeNull();
  });

  it("calls the binding with the model, request, and abort signal and returns the extracted answer", async () => {
    const { runner, calls } = fakeRunner({ response: "answer" });
    const provider = createWorkersAiProvider(runner, "@cf/qwen/qwen3-30b-a3b-fp8");
    expect(provider?.model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    const signal = new AbortController().signal;
    expect(await provider?.explain(INPUT, signal)).toBe("answer");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    expect(calls[0]?.signal).toBe(signal);
    expect(calls[0]?.inputs.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
