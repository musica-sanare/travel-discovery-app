/**
 * Whether this site offers AI assistance at all (`GET /api/ai/status`,
 * docs/working/DECISIONS.md ADR-026). Only "off" disables the toggle; while
 * loading or when the status cannot be read, the toggle stays usable and the
 * results page still handles every failure with a notice.
 */
import { useEffect, useState } from "react";
import { AI_STATUS_PATH, aiStatusResponseSchema } from "../../shared/ai-explanation";

export type AiSiteStatus = "loading" | "on" | "off" | "unknown";

export async function fetchAiStatus(fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<Exclude<AiSiteStatus, "loading">> {
  try {
    const response = await fetchImpl(AI_STATUS_PATH, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) });
    if (!response.ok) {
      return "unknown";
    }
    const parsed = aiStatusResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return "unknown";
    }
    return parsed.data.enabled ? "on" : "off";
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return "unknown";
  }
}

/** Fetches the status once per mount of the page that shows the toggle. */
export function useAiSiteStatus(): AiSiteStatus {
  const [status, setStatus] = useState<AiSiteStatus>("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetchAiStatus(fetch, controller.signal).then(setStatus, () => undefined);
    return () => {
      controller.abort();
    };
  }, []);
  return status;
}
