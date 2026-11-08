/**
 * Boundary between the AI explanation use case and a model provider
 * (docs/en/ARCHITECTURE.md §5, docs/working/DECISIONS.md ADR-026). The input is already
 * minimized and validated; the output is untrusted and validated by the
 * caller.
 */
import type { Locale } from "../../shared/locales";

/**
 * One destination's model input. It is the same whatever the destination's
 * fit or rank, so the model gets no signal to compare destinations with
 * (docs/working/DECISIONS.md ADR-026, Phase 22).
 */
export interface ExplanationDestination {
  /** Opaque per-request ID (`d1`, `d2`, …) in slug order; never a slug or rank. */
  id: string;
  name: string;
  country: string | null;
  summary: string;
  highlights: readonly string[];
}

export interface ExplanationInput {
  locale: Locale;
  /** Localized names of the user's strongest positive preferences. */
  preferences: readonly string[];
  destinations: readonly ExplanationDestination[];
}

export interface ExplanationProvider {
  /** Model identifier for operational logs. */
  readonly model: string;
  /** Returns the raw model output (parsed JSON or text). `signal` aborts on timeout. */
  explain(input: ExplanationInput, signal: AbortSignal): Promise<unknown>;
}
