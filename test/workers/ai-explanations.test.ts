import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { rankDestinations } from "../../domain/diagnosis";
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import { toEngineContent } from "../../shared/engine-content";
import type { ExplanationInput, ExplanationProvider } from "../../server/ai/provider";
import { createPublicApp, type AiDependencies, type PublicEnv, type RateLimiter } from "../../worker/index";
import { ensureSeeded, json, publicRequest } from "./helpers";

const ORIGIN = "https://public.example.test";
const PATH = "/api/ai/explanations";

type Explain = (input: ExplanationInput, signal: AbortSignal) => Promise<unknown>;

/** Fake provider: echoes one text per input ID unless `explain` is given. */
function fakeProvider(explain?: Explain) {
  const calls: ExplanationInput[] = [];
  const provider: ExplanationProvider = {
    model: "fake-model",
    explain(input, signal) {
      calls.push(input);
      if (explain) {
        return explain(input, signal);
      }
      return Promise.resolve({
        explanations: input.destinations.map((item) => ({ id: item.id, text: `Text for ${item.id}` })),
      });
    },
  };
  return { provider, calls };
}

function limiter(success: boolean) {
  const keys: string[] = [];
  const value: RateLimiter = {
    limit({ key }) {
      keys.push(key);
      return Promise.resolve({ success });
    },
  };
  return { limiter: value, keys };
}

interface SendOptions {
  body?: unknown;
  method?: string;
  origin?: string | null;
  contentType?: string;
  enabled?: string | undefined;
  dependencies?: Partial<AiDependencies>;
  headers?: Record<string, string>;
}

function send(options: SendOptions = {}): Promise<Response> {
  const dependencies: AiDependencies = {
    provider: null,
    clientLimiter: null,
    globalLimiter: null,
    ...options.dependencies,
  };
  const app = createPublicApp({ aiDependencies: () => dependencies });
  const headers = new Headers(options.headers);
  if (options.origin !== null) headers.set("Origin", options.origin ?? ORIGIN);
  headers.set("Content-Type", options.contentType ?? "application/json");
  const body = options.body === undefined ? null : typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  const publicEnv: PublicEnv = {
    PUBLIC_DB: env.ADMIN_DB,
    ...("enabled" in options ? (options.enabled === undefined ? {} : { AI_ASSIST_ENABLED: options.enabled }) : { AI_ASSIST_ENABLED: "true" }),
  };
  return Promise.resolve(app.fetch(new Request(`${ORIGIN}${PATH}`, { method: options.method ?? "POST", headers, body }), publicEnv));
}

let content: DiagnosisContentResponse;
let validBody: {
  locale: "ja";
  answers: { question: string; options: string[] }[];
  constraints: Record<string, unknown>;
  expected: string[];
};

beforeAll(async () => {
  await ensureSeeded();
  content = (await json(await publicRequest("/api/diagnosis-content?locale=ja"))) as DiagnosisContentResponse;
  const answers = content.questions.map((question) => ({ question: question.slug, options: [question.options[0]?.value ?? ""] }));
  const ranking = rankDestinations(toEngineContent(content), answers, {}, content.settings);
  validBody = { locale: "ja", answers, constraints: {}, expected: ranking.results.map((item) => item.slug) };
  expect(validBody.expected.length).toBeGreaterThan(1);
});

function body(overrides: Record<string, unknown> = {}) {
  return { ...validBody, ...overrides };
}

describe("POST /api/ai/explanations: success", () => {
  it("returns texts mapped to the recomputed slugs in rank order", async () => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: body(), dependencies: { provider } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = (await json(response)) as { explanations: { slug: string; text: string }[] };
    expect(result.explanations.map((item) => item.slug)).toEqual(validBody.expected);
    for (const item of result.explanations) {
      expect(Object.keys(item).sort()).toEqual(["slug", "text"]);
    }
    expect(Object.keys(result)).toEqual(["explanations"]);
    expect(calls).toHaveLength(1);
  });

  it("sends the model opaque IDs in slug order and no slugs, ranks, scores, costs, or answers", async () => {
    const { provider, calls } = fakeProvider();
    await send({ body: body({ constraints: { days: 4, months: [4], budget: { amount: 987654, currency: "JPY" } } }), dependencies: { provider } });
    const input = calls[0];
    expect(input).toBeDefined();
    if (!input) return;
    const sortedSlugs = [...validBody.expected].sort();
    expect(input.destinations.map((item) => item.id)).toEqual(sortedSlugs.map((_, index) => `d${String(index + 1)}`));
    const names = new Map(content.destinations.map((item) => [item.slug, item.name]));
    expect(input.destinations.map((item) => item.name)).toEqual(sortedSlugs.map((slug) => names.get(slug)));
    expect(input.preferences.length).toBeGreaterThan(0);
    expect(input.locale).toBe("ja");

    const serialized = JSON.stringify(input);
    for (const slug of [...validBody.expected, ...validBody.answers.map((answer) => answer.question)]) {
      expect(serialized).not.toContain(`"${slug}"`);
    }
    for (const forbidden of ["rank", "fit", "score", "cost", "budget", "987654", "season", "duration"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("accepts model output given as JSON text and in any ID order", async () => {
    const { provider } = fakeProvider((input: ExplanationInput) =>
      Promise.resolve(
        JSON.stringify({ explanations: [...input.destinations].reverse().map((item) => ({ id: item.id, text: `T ${item.id}` })) }),
      ),
    );
    const response = await send({ body: body(), dependencies: { provider } });
    expect(response.status).toBe(200);
    const result = (await json(response)) as { explanations: { slug: string }[] };
    expect(result.explanations.map((item) => item.slug)).toEqual(validBody.expected);
  });
});

describe("POST /api/ai/explanations: switches, methods, and request checks", () => {
  it.each([[undefined], ["false"], ["TRUE"], ["1"]])("returns 503 without calling AI when AI_ASSIST_ENABLED is %s", async (enabled) => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: body(), enabled, dependencies: { provider } });
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: "ai_unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("returns 503 when no provider is configured", async () => {
    const response = await send({ body: body() });
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: "ai_unavailable" });
  });

  it("is unavailable on the default public app", async () => {
    const response = await publicRequest(PATH, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(503);
  });

  it.each([["https://evil.example"], [null]])("rejects origin %s with 403", async (origin) => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: body(), origin, dependencies: { provider } });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it.each(["GET", "HEAD", "PUT", "DELETE"])("rejects %s with 405", async (method) => {
    const response = await send({ method, ...(method === "GET" || method === "HEAD" ? {} : { body: body() }) });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("keeps other paths GET/HEAD only", async () => {
    const response = await publicRequest("/api/diagnosis-content", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("rejects non-JSON media types, oversized bodies, and malformed JSON", async () => {
    const { provider, calls } = fakeProvider();
    expect((await send({ body: body(), contentType: "text/plain", dependencies: { provider } })).status).toBe(415);
    expect((await send({ body: "x".repeat(64 * 1024 + 1), dependencies: { provider } })).status).toBe(413);
    expect((await send({ body: "{", dependencies: { provider } })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  const answer = (question: string, options: string[] = ["a"]) => ({ question, options });
  const manyAnswers = (count: number) => Array.from({ length: count }, (_, index) => answer(`q${String(index)}`));

  it.each([
    ["an unknown top-level key", { extra: true }],
    ["an unknown answer key", { answers: [{ question: "q", options: [], note: "x" }] }],
    ["no answers", { answers: [] }],
    ["more than 30 answers", { answers: manyAnswers(31) }],
    ["a duplicate question", { answers: [answer("q"), answer("q")] }],
    ["a duplicate option", { answers: [answer("q", ["a", "a"])] }],
    ["more than 20 options", { answers: [answer("q", Array.from({ length: 21 }, (_, index) => `o${String(index)}`))] }],
    ["a malformed slug", { answers: [answer("Bad Slug")] }],
    ["an overlong slug", { answers: [answer("a".repeat(65))] }],
    ["days above MAX_TRIP_DAYS", { constraints: { days: 366 } }],
    ["non-integer days", { constraints: { days: 1.5 } }],
    ["a month out of range", { constraints: { months: [13] } }],
    ["duplicate months", { constraints: { months: [4, 4] } }],
    ["a budget above MAX_BUDGET", { constraints: { budget: { amount: 100_000_001, currency: "JPY" } } }],
    ["an unsupported currency", { constraints: { budget: { amount: 1000, currency: "GBP" } } }],
    ["an unsupported locale", { locale: "fr" }],
    ["no expected results", { expected: [] }],
    ["more than 5 expected results", { expected: ["a", "b", "c", "d", "e", "f"] }],
    ["duplicate expected results", { expected: ["a", "a"] }],
    ["client-supplied scores", { scores: { lisbon: 99 } }],
  ])("rejects %s with 400 without calling AI", async (_, overrides) => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: body(overrides), dependencies: { provider } });
    expect(response.status).toBe(400);
    expect(((await json(response)) as { error: string }).error).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects more answers than the quiz settings allow", async () => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: body({ answers: manyAnswers(content.settings.maxQuestions + 1) }), dependencies: { provider } });
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "invalid_request", issues: [{ path: "answers", code: "too_big" }] });
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/ai/explanations: server-side recomputation", () => {
  it.each([
    ["an unknown question", () => body({ answers: [...validBody.answers, { question: "unknown-question", options: ["a"] }] })],
    ["an unknown option", () => body({ answers: validBody.answers.map((item, index) => (index === 0 ? { ...item, options: ["no-such-option"] } : item)) })],
    ["a reordered expected ranking", () => body({ expected: [...validBody.expected].reverse() })],
    ["a missing expected result", () => body({ expected: validBody.expected.slice(0, -1) })],
    ["a foreign expected result", () => body({ expected: [...validBody.expected.slice(0, -1), "atlantis"] })],
  ])("returns 409 without calling AI for %s", async (_, makeBody) => {
    const { provider, calls } = fakeProvider();
    const response = await send({ body: makeBody(), dependencies: { provider } });
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "conflict" });
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/ai/explanations: untrusted model output", () => {
  const ids = () => validBody.expected.map((_, index) => `d${String(index + 1)}`);
  const items = (list: string[], text = "Text") => list.map((id) => ({ id, text }));

  it.each([
    ["a missing ID", () => ({ explanations: items(ids().slice(1)) })],
    ["an extra ID", () => ({ explanations: items([...ids(), "d9"]) })],
    ["a duplicate ID", () => ({ explanations: items([...ids().slice(1), ids()[1] ?? "d2"]) })],
    ["a slug instead of an ID", () => ({ explanations: items(validBody.expected) })],
    ["empty text", () => ({ explanations: items(ids(), "   ") })],
    ["text over the length limit", () => ({ explanations: items(ids(), "x".repeat(401)) })],
    ["an extra field such as a rank", () => ({ explanations: ids().map((id, index) => ({ id, text: "T", rank: index })) })],
    ["an extra top-level field", () => ({ explanations: items(ids()), order: ids() })],
    ["a non-JSON string", () => "Here are your explanations"],
    ["null", () => null],
  ])("returns 503 for %s", async (_, output) => {
    const { provider } = fakeProvider(() => Promise.resolve(output()));
    const response = await send({ body: body(), dependencies: { provider } });
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: "ai_unavailable" });
  });

  it("returns 503 without provider details when the provider fails", async () => {
    const { provider } = fakeProvider(() => Promise.reject(new Error("3036: account daily neuron limit exceeded; secret-binding-name")));
    const response = await send({ body: body(), dependencies: { provider } });
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ error: "ai_unavailable" }));
  });

  it("times out, aborts the provider signal, and returns 503", async () => {
    let aborted = false;
    const { provider } = fakeProvider((_input: ExplanationInput, signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => undefined);
    });
    const response = await send({ body: body(), dependencies: { provider, timeoutMs: 20 } });
    expect(response.status).toBe(503);
    expect(aborted).toBe(true);
  });
});

describe("POST /api/ai/explanations: rate limiting and logs", () => {
  it("returns 429 without calling AI or reading the body when a limiter refuses", async () => {
    for (const which of ["globalLimiter", "clientLimiter"] as const) {
      const { provider, calls } = fakeProvider();
      const refused = limiter(false);
      const response = await send({ body: "{", dependencies: { provider, [which]: refused.limiter } });
      expect(response.status).toBe(429);
      expect(await json(response)).toEqual({ error: "rate_limited" });
      expect(calls).toHaveLength(0);
    }
  });

  it("keys the client limiter by IP address and the global limiter by one key", async () => {
    const { provider } = fakeProvider();
    const client = limiter(true);
    const global = limiter(true);
    const response = await send({
      body: body(),
      headers: { "CF-Connecting-IP": "203.0.113.5" },
      dependencies: { provider, clientLimiter: client.limiter, globalLimiter: global.limiter },
    });
    expect(response.status).toBe(200);
    expect(client.keys).toEqual(["ip:203.0.113.5"]);
    expect(global.keys).toEqual(["global"]);
  });

  it("logs only outcome, model, latency, and count", async () => {
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "info").mockImplementation(capture);

    const secretText = "UNIQUE-MODEL-TEXT";
    const ok = fakeProvider((input: ExplanationInput) =>
      Promise.resolve({ explanations: input.destinations.map((item) => ({ id: item.id, text: secretText })) }),
    );
    const failing = fakeProvider(() => Promise.reject(new Error("PROVIDER-SECRET-MESSAGE")));
    const headers = { "CF-Connecting-IP": "203.0.113.77" };
    const constraints = { budget: { amount: 424242, currency: "JPY" } };
    await send({ body: body({ constraints }), headers, dependencies: { provider: ok.provider } });
    await send({ body: body({ constraints }), headers, dependencies: { provider: failing.provider } });
    await send({ body: body({ expected: [...validBody.expected].reverse() }), headers, dependencies: { provider: ok.provider } });

    expect(logs.map((line) => (JSON.parse(line) as { outcome: string }).outcome)).toEqual([
      "ok",
      "provider_error",
      "content_mismatch",
    ]);
    for (const line of logs) {
      expect(Object.keys(JSON.parse(line) as object).sort()).toEqual(["destinationCount", "event", "latencyMs", "model", "outcome"]);
    }
    const all = logs.join("\n");
    for (const forbidden of [secretText, "PROVIDER-SECRET-MESSAGE", "203.0.113.77", "424242", ...validBody.expected, ...validBody.answers.map((item) => item.question)]) {
      expect(all).not.toContain(forbidden);
    }
  });
});
