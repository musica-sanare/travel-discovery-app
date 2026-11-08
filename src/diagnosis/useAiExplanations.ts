import { useEffect, useMemo, useState } from "react";
import type { AiExplanationRequest } from "../../shared/ai-explanation";
import type { Locale } from "../../shared/locales";
import type { Answer, RankingResult, ResultVariety, TripConstraints } from "../../domain/diagnosis";
import { fetchAiExplanations, type AiExplanationResult, type AiFailure } from "./aiClient";

export type AiExplanationState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; texts: ReadonlyMap<string, string> }
  | ({ status: "failed" } & AiFailure);

/**
 * Builds the request from in-memory quiz state; null when there is nothing to
 * explain. `variety` is the seed and draw that chose the shown results, so the
 * server can recompute them (ADR-037); null without a running quiz.
 */
export function buildAiRequest(
  locale: Locale,
  answers: readonly Answer[],
  constraints: TripConstraints,
  ranking: RankingResult,
  variety: ResultVariety | null,
): AiExplanationRequest | null {
  if (answers.length === 0 || ranking.results.length === 0 || variety === null) {
    return null;
  }
  return {
    locale,
    answers: answers.map((answer) => ({ question: answer.question, options: [...answer.options] })),
    constraints: {
      ...(constraints.days === undefined ? {} : { days: constraints.days }),
      ...(constraints.months === undefined ? {} : { months: [...constraints.months] }),
      ...(constraints.budget === undefined ? {} : { budget: { ...constraints.budget } }),
    },
    expected: ranking.results.map((item) => item.slug),
    variety: { seed: variety.seed, draw: variety.draw },
  };
}

/**
 * Requests AI explanations at most once per distinct request (results and
 * locale) while `enabled`; no request at all when disabled. Settled results,
 * including failures, are remembered in memory for the life of the page
 * component, so switching back to an earlier language sends nothing; failures
 * are never retried automatically.
 */
export function useAiExplanations(enabled: boolean, request: AiExplanationRequest | null): AiExplanationState {
  const key = useMemo(() => (enabled && request ? JSON.stringify(request) : null), [enabled, request]);
  const [settled, setSettled] = useState<ReadonlyMap<string, AiExplanationResult>>(() => new Map());
  const cached = key !== null && settled.has(key);

  useEffect(() => {
    if (key === null || cached) {
      return;
    }
    // The key is the serialized request, so the effect runs once per distinct request
    // even when the caller passes a new but equal object.
    const body = JSON.parse(key) as AiExplanationRequest;
    const controller = new AbortController();
    fetchAiExplanations(body, fetch, controller.signal).then(
      (result) => {
        setSettled((previous) => new Map(previous).set(key, result));
      },
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, [key, cached]);

  if (!enabled) {
    return { status: "off" };
  }
  if (key === null) {
    return { status: "failed", reason: "unavailable" };
  }
  const result = settled.get(key);
  if (!result) {
    return { status: "loading" };
  }
  if (result.ok) {
    return { status: "ready", texts: result.texts };
  }
  return result.reason === "rate_limited_daily" || result.reason === "rate_limited_global"
    ? { status: "failed", reason: result.reason, retryAt: result.retryAt }
    : { status: "failed", reason: result.reason };
}
