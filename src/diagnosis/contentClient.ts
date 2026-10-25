/**
 * Loads and validates the diagnosis content snapshot (docs/working/DECISIONS.md
 * ADR-022). Any non-success, non-JSON, or unexpected response is reported as
 * `unavailable` (covers D1 limits and the platform's Error 1027 page).
 */
import { diagnosisContentSchema, type DiagnosisContentResponse } from "../../shared/diagnosis-content";
import type { Locale } from "../../shared/locales";

export type ContentLoadError = "network" | "unavailable";

export type ContentLoadResult =
  | { ok: true; content: DiagnosisContentResponse }
  | { ok: false; error: ContentLoadError };

export const CONTENT_MAX_AGE_MS = 5 * 60 * 1000;

export async function fetchDiagnosisContent(
  locale: Locale,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ContentLoadResult> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/diagnosis-content?locale=${encodeURIComponent(locale)}`, {
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return { ok: false, error: "network" };
  }
  if (!response.ok) {
    return { ok: false, error: "unavailable" };
  }
  try {
    const parsed = diagnosisContentSchema.safeParse(await response.json());
    return parsed.success && parsed.data.locale === locale
      ? { ok: true, content: parsed.data }
      : { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

interface CacheEntry {
  content: DiagnosisContentResponse;
  fetchedAt: number;
}

/**
 * In-memory snapshot cache per locale. Entries older than `maxAgeMs` are
 * refetched; nothing is persisted, so a reload always fetches fresh content.
 */
export function createContentCache(
  load: (locale: Locale, signal?: AbortSignal) => Promise<ContentLoadResult> = (locale, signal) =>
    fetchDiagnosisContent(locale, fetch, signal),
  now: () => number = Date.now,
  maxAgeMs = CONTENT_MAX_AGE_MS,
) {
  const entries = new Map<Locale, CacheEntry>();
  return {
    async get(locale: Locale, signal?: AbortSignal): Promise<ContentLoadResult> {
      const cached = entries.get(locale);
      if (cached && now() - cached.fetchedAt < maxAgeMs) {
        return { ok: true, content: cached.content };
      }
      const result = await load(locale, signal);
      if (result.ok) {
        entries.set(locale, { content: result.content, fetchedAt: now() });
      }
      return result;
    },
    clear(): void {
      entries.clear();
    },
  };
}

export type ContentCache = ReturnType<typeof createContentCache>;

/** Cache used by the app; one per page load. */
export const sharedContentCache = createContentCache();
