/**
 * AI explanation use case (`POST /api/ai/explanations`, docs/DECISIONS.md
 * ADR-026). Recomputes the ranking from published content with the same
 * engine as the browser, refuses requests whose answers or expected results do
 * not match, sends only a minimal ranking-free summary to the provider, and
 * maps validated output back to slugs. Reads only; must not import write
 * helpers (ADR-018).
 */
import { rankDestinations, topPreferences, type TripConstraints } from "../../domain/diagnosis";
import type { AiExplanationRequest, AiExplanationResponse } from "../../shared/ai-explanation";
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import { toEngineContent } from "../../shared/engine-content";
import { parseModelOutput } from "../ai/output";
import type { ExplanationDestination, ExplanationInput, ExplanationProvider } from "../ai/provider";
import type { Database } from "../db/client";
import { ApiError } from "../http/errors";
import { getDiagnosisContent } from "./diagnosis-content";

export const PREFERENCE_SUMMARY_COUNT = 5;
export const MAX_SUMMARY_LENGTH = 600;
export const MAX_HIGHLIGHTS = 5;
export const MAX_HIGHLIGHT_LENGTH = 100;
export const DEFAULT_AI_TIMEOUT_MS = 8_000;

export type AiOutcome = "ok" | "content_mismatch" | "provider_error" | "timeout" | "invalid_output";

export interface AiExplanationOptions {
  provider: ExplanationProvider;
  timeoutMs?: number;
  now?: () => number;
  log?: (entry: { event: "ai_explanation"; outcome: AiOutcome; model: string; latencyMs: number; destinationCount: number }) => void;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function toConstraints(constraints: AiExplanationRequest["constraints"]): TripConstraints {
  return {
    ...(constraints.days === undefined ? {} : { days: constraints.days }),
    ...(constraints.months === undefined ? {} : { months: constraints.months }),
    ...(constraints.budget === undefined ? {} : { budget: constraints.budget }),
  };
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Builds the model input with opaque IDs assigned in slug order, so neither IDs nor order reveal the ranking. */
export function buildExplanationInput(
  content: DiagnosisContentResponse,
  request: AiExplanationRequest,
  ranked: readonly { slug: string; topAttributes: readonly { attribute: string }[] }[],
): { input: ExplanationInput; slugById: ReadonlyMap<string, string> } {
  const attributeNames = new Map(content.attributes.map((item) => [item.slug, item.name]));
  const destinations = new Map(content.destinations.map((item) => [item.slug, item]));
  const nameOf = (attribute: string) => attributeNames.get(attribute) ?? [];

  const slugById = new Map<string, string>();
  const items: ExplanationDestination[] = [];
  for (const result of [...ranked].sort((a, b) => compareSlugs(a.slug, b.slug))) {
    const destination = destinations.get(result.slug);
    if (!destination) {
      continue;
    }
    const id = `d${String(items.length + 1)}`;
    slugById.set(id, result.slug);
    items.push({
      id,
      name: destination.name,
      country: destination.country.name,
      summary: truncate(destination.summary, MAX_SUMMARY_LENGTH),
      highlights: destination.highlights.slice(0, MAX_HIGHLIGHTS).map((text) => truncate(text, MAX_HIGHLIGHT_LENGTH)),
      matches: result.topAttributes.flatMap((item) => nameOf(item.attribute)),
    });
  }

  const preferences = topPreferences(toEngineContent(content), request.answers, PREFERENCE_SUMMARY_COUNT).flatMap(
    (item) => nameOf(item.attribute),
  );
  return { input: { locale: request.locale, preferences, destinations: items }, slugById };
}

class TimeoutError extends Error {}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new TimeoutError());
    });
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

export async function explainDiagnosis(
  db: Database,
  request: AiExplanationRequest,
  options: AiExplanationOptions,
): Promise<AiExplanationResponse> {
  const { provider, timeoutMs = DEFAULT_AI_TIMEOUT_MS, now = Date.now, log = () => undefined } = options;
  const started = now();
  const report = (outcome: AiOutcome, destinationCount: number) => {
    log({ event: "ai_explanation", outcome, model: provider.model, latencyMs: now() - started, destinationCount });
  };

  const content = await getDiagnosisContent(db, request.locale);
  if (request.answers.length > content.settings.maxQuestions) {
    throw new ApiError("invalid_request", [{ path: "answers", code: "too_big" }]);
  }

  const ranking = rankDestinations(toEngineContent(content), request.answers, toConstraints(request.constraints), content.settings);
  const slugs = ranking.results.map((item) => item.slug);
  if (ranking.ignoredAnswers.length > 0 || !sameOrder(slugs, request.expected)) {
    report("content_mismatch", 0);
    throw new ApiError("conflict");
  }

  const { input, slugById } = buildExplanationInput(content, request, ranking.results);
  let raw: unknown;
  try {
    raw = await withTimeout((signal) => provider.explain(input, signal), timeoutMs);
  } catch (error) {
    report(error instanceof TimeoutError ? "timeout" : "provider_error", input.destinations.length);
    throw new ApiError("ai_unavailable");
  }

  const texts = parseModelOutput(raw, [...slugById.keys()], request.locale);
  if (!texts) {
    report("invalid_output", input.destinations.length);
    throw new ApiError("ai_unavailable");
  }

  const textBySlug = new Map([...texts].map(([id, text]) => [slugById.get(id) ?? "", text]));
  report("ok", input.destinations.length);
  return {
    explanations: slugs.flatMap((slug) => {
      const text = textBySlug.get(slug);
      return text === undefined ? [] : [{ slug, text }];
    }),
  };
}
