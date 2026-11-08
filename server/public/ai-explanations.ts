/**
 * AI explanation use case (`POST /api/ai/explanations`, docs/working/DECISIONS.md
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
import { validateModelOutput, type OutputRejection, type TextRejection } from "../ai/output";
import type { ExplanationDestination, ExplanationInput, ExplanationProvider } from "../ai/provider";
import type { Database } from "../db/client";
import { ApiError } from "../http/errors";
import type { GlobalDecision } from "./client-quota";
import { getDiagnosisContent } from "./diagnosis-content";

export const PREFERENCE_SUMMARY_COUNT = 5;
export const MAX_SUMMARY_LENGTH = 600;
export const MAX_HIGHLIGHTS = 5;
export const MAX_HIGHLIGHT_LENGTH = 100;
export const DEFAULT_AI_TIMEOUT_MS = 8_000;

export type AiOutcome =
  | "ok"
  | "content_mismatch"
  | "provider_error"
  | "timeout"
  | "invalid_output"
  | "disabled"
  | "rate_limited_window"
  | "rate_limited_daily"
  | "rate_limited_global"
  | "limiter_unavailable";

/**
 * The only log line for AI requests: no answers, texts, prompts, or addresses.
 * `reason` is present only for `invalid_output` and names the failed check.
 * `dropped` and `droppedReasons` are present only when notes failed a text
 * guard: their number and reason codes in input order (ADR-026, Phase 22).
 */
export interface AiLogEntry {
  event: "ai_explanation";
  outcome: AiOutcome;
  model: string | null;
  latencyMs: number;
  destinationCount: number;
  reason?: OutputRejection;
  dropped?: number;
  droppedReasons?: readonly TextRejection[];
}

/** The app-wide daily cap refused the model call (ADR-029); the Worker answers 429 `global`. */
export class GlobalLimitError extends Error {
  constructor(readonly retryAt: number) {
    super("global_limit");
  }
}

export interface AiExplanationOptions {
  provider: ExplanationProvider;
  /**
   * Counts one model call against the app-wide daily cap (ADR-029). Called
   * after every other check, right before the model call, so only real calls
   * are counted. A failure means no model call (fails closed).
   */
  admitModelCall: () => Promise<GlobalDecision>;
  timeoutMs?: number;
  now?: () => number;
  log?: (entry: AiLogEntry) => void;
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

/**
 * Builds the model input with opaque IDs assigned in slug order, so neither
 * IDs nor order reveal the ranking. Each destination carries only its own
 * name, country, summary, and highlights: nothing that varies with its fit,
 * such as matched attributes (owner decision 2026-11-08, ADR-026).
 */
export function buildExplanationInput(
  content: DiagnosisContentResponse,
  request: AiExplanationRequest,
  ranked: readonly { slug: string }[],
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
  const { provider, admitModelCall, timeoutMs = DEFAULT_AI_TIMEOUT_MS, now = Date.now, log = () => undefined } = options;
  const started = now();
  const report = (
    outcome: AiOutcome,
    destinationCount: number,
    reason?: OutputRejection,
    dropped: readonly TextRejection[] = [],
  ) => {
    log({
      event: "ai_explanation",
      outcome,
      model: provider.model,
      latencyMs: now() - started,
      destinationCount,
      ...(reason === undefined ? {} : { reason }),
      ...(dropped.length === 0 ? {} : { dropped: dropped.length, droppedReasons: dropped }),
    });
  };

  const content = await getDiagnosisContent(db, request.locale);
  if (request.answers.length > content.settings.maxQuestions) {
    throw new ApiError("invalid_request", [{ path: "answers", code: "too_big" }]);
  }

  const ranking = rankDestinations(
    toEngineContent(content),
    request.answers,
    toConstraints(request.constraints),
    content.settings,
    request.variety,
  );
  const slugs = ranking.results.map((item) => item.slug);
  if (ranking.ignoredAnswers.length > 0 || !sameOrder(slugs, request.expected)) {
    report("content_mismatch", 0);
    throw new ApiError("conflict");
  }

  const { input, slugById } = buildExplanationInput(content, request, ranking.results);
  let admission: GlobalDecision;
  try {
    admission = await admitModelCall();
  } catch {
    report("limiter_unavailable", 0);
    throw new ApiError("ai_unavailable");
  }
  if (!admission.success) {
    report("rate_limited_global", 0);
    throw new GlobalLimitError(admission.retryAt);
  }

  let raw: unknown;
  try {
    raw = await withTimeout((signal) => provider.explain(input, signal), timeoutMs);
  } catch (error) {
    report(error instanceof TimeoutError ? "timeout" : "provider_error", input.destinations.length);
    throw new ApiError("ai_unavailable");
  }

  const output = validateModelOutput(raw, input);
  if (!output.ok) {
    report("invalid_output", input.destinations.length, output.reason, output.dropped);
    throw new ApiError("ai_unavailable");
  }

  const textBySlug = new Map([...output.texts].map(([id, text]) => [slugById.get(id) ?? "", text]));
  report("ok", input.destinations.length, undefined, output.dropped);
  return {
    explanations: slugs.flatMap((slug) => {
      const text = textBySlug.get(slug);
      return text === undefined ? [] : [{ slug, text }];
    }),
  };
}
