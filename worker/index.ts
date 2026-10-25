/**
 * Public Worker. Only requests matching `assets.run_worker_first` in
 * wrangler.jsonc (`/api/*`) reach this Worker; static assets and SPA routes are
 * served by the Workers static-assets layer without invoking it.
 *
 * This Worker is read-only: it serves GET/HEAD, plus the read-only
 * `POST /api/ai/explanations` (docs/working/DECISIONS.md ADR-026), and imports read
 * modules only. That is a code-level constraint (ADR-018), not a database
 * permission.
 */
import { Hono } from "hono";
import { AI_EXPLANATIONS_PATH, aiExplanationRequestSchema } from "../shared/ai-explanation";
import type { ExplanationProvider } from "../server/ai/provider";
import { createWorkersAiProvider } from "../server/ai/workers-ai";
import { createDatabase } from "../server/db/client";
import { errorResponse, jsonResponse, toErrorResponse } from "../server/http/errors";
import { hasSameOrigin, parseLocaleParam, readJsonBody } from "../server/http/request";
import { isSlug } from "../shared/slug";
import { explainDiagnosis, type AiLogEntry } from "../server/public/ai-explanations";
import { clientRateLimitKey } from "../server/public/rate-limit-key";
import { getDiagnosisContent } from "../server/public/diagnosis-content";
import {
  getPublishedDestination,
  listPublishedDestinations,
  listPublishedQuestions,
} from "../server/public/content";

export interface PublicEnv {
  PUBLIC_DB: D1Database;
  /** AI explanations run only when this is exactly "true" (kill switch, ADR-026). */
  AI_ASSIST_ENABLED?: string;
  /** Workers AI model ID from the shortlist in server/ai/workers-ai.ts. */
  AI_MODEL?: string;
  /** Optional bindings; none is configured in wrangler.jsonc yet (ADR-026). */
  AI?: Ai;
  AI_CLIENT_RATE_LIMITER?: RateLimit;
}

/** Same shape as the Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AiDependencies {
  /** null: AI is unavailable (503 ai_unavailable). */
  provider: ExplanationProvider | null;
  /**
   * Per-client limiter keyed by client address (IPv6 by /64); null: not
   * applied. There is deliberately no limiter shared by all clients (ADR-026 A).
   */
  clientLimiter: RateLimiter | null;
  timeoutMs?: number;
}

export interface PublicAppOptions {
  /** Resolves AI dependencies per request; tests inject fakes. */
  aiDependencies?: (env: PublicEnv) => AiDependencies;
}

/** Dependencies from the Worker's bindings; anything missing leaves AI unavailable or unlimited. */
export function aiDependenciesFromEnv(env: PublicEnv): AiDependencies {
  const ai = env.AI;
  const provider =
    ai && env.AI_MODEL
      ? createWorkersAiProvider({ run: (model, inputs, options) => ai.run(model, inputs, options) }, env.AI_MODEL)
      : null;
  return {
    provider,
    clientLimiter: env.AI_CLIENT_RATE_LIMITER ?? null,
  };
}

const READ_METHODS = new Set(["GET", "HEAD"]);

function logAiEvent(entry: AiLogEntry): void {
  console.log(JSON.stringify(entry));
}

/** Outcome-only log line for requests stopped before the use case (no address). */
function logStopped(outcome: "disabled" | "rate_limited", provider: ExplanationProvider | null): void {
  logAiEvent({ event: "ai_explanation", outcome, model: provider?.model ?? null, latencyMs: 0, destinationCount: 0 });
}

async function withinRateLimit(dependencies: AiDependencies, request: Request): Promise<boolean> {
  if (!dependencies.clientLimiter) {
    return true;
  }
  // CF-Connecting-IP is set by Cloudflare's edge; X-Forwarded-For can carry client-supplied values.
  const key = clientRateLimitKey(request.headers.get("CF-Connecting-IP"));
  return (await dependencies.clientLimiter.limit({ key })).success;
}

export function createPublicApp(options: PublicAppOptions = {}) {
  const resolveAi = options.aiDependencies ?? aiDependenciesFromEnv;
  const app = new Hono<{ Bindings: PublicEnv }>();

  app.use("*", async (c, next) => {
    if (c.req.path === AI_EXPLANATIONS_PATH) {
      if (c.req.method !== "POST") {
        return errorResponse("method_not_allowed", undefined, { Allow: "POST" });
      }
    } else if (!READ_METHODS.has(c.req.method)) {
      return errorResponse("method_not_allowed", undefined, { Allow: "GET, HEAD" });
    }
    await next();
  });

  app.get("/api/health", () => jsonResponse({ status: "ok" }));

  app.get("/api/destinations", async (c) => {
    const locale = parseLocaleParam(new URL(c.req.url));
    const items = await listPublishedDestinations(createDatabase(c.env.PUBLIC_DB), locale);
    return jsonResponse({ items });
  });

  app.get("/api/destinations/:slug", async (c) => {
    // Malformed or overlong slugs cannot exist, so answer without a D1 read.
    const slug = c.req.param("slug");
    if (!isSlug(slug)) {
      return errorResponse("not_found");
    }
    const locale = parseLocaleParam(new URL(c.req.url));
    const item = await getPublishedDestination(createDatabase(c.env.PUBLIC_DB), slug, locale);
    return item ? jsonResponse({ item }) : errorResponse("not_found");
  });

  app.get("/api/questions", async (c) => {
    const locale = parseLocaleParam(new URL(c.req.url));
    const items = await listPublishedQuestions(createDatabase(c.env.PUBLIC_DB), locale);
    return jsonResponse({ items });
  });

  app.get("/api/diagnosis-content", async (c) => {
    const locale = parseLocaleParam(new URL(c.req.url));
    return jsonResponse(await getDiagnosisContent(createDatabase(c.env.PUBLIC_DB), locale));
  });

  app.post(AI_EXPLANATIONS_PATH, async (c) => {
    if (!hasSameOrigin(c.req.raw)) {
      return errorResponse("forbidden");
    }
    const dependencies = resolveAi(c.env);
    // The limiter runs before the kill switch so that it can be verified on a
    // deployment with AI disabled, without any model call (Phase 11 log).
    if (!(await withinRateLimit(dependencies, c.req.raw))) {
      logStopped("rate_limited", dependencies.provider);
      return errorResponse("rate_limited");
    }
    if (c.env.AI_ASSIST_ENABLED !== "true" || !dependencies.provider) {
      logStopped("disabled", dependencies.provider);
      return errorResponse("ai_unavailable");
    }
    const request = await readJsonBody(c.req.raw, aiExplanationRequestSchema);
    const response = await explainDiagnosis(createDatabase(c.env.PUBLIC_DB), request, {
      provider: dependencies.provider,
      ...(dependencies.timeoutMs === undefined ? {} : { timeoutMs: dependencies.timeoutMs }),
      log: logAiEvent,
    });
    return jsonResponse(response);
  });

  app.notFound(() => errorResponse("not_found"));
  app.onError((error) => toErrorResponse(error, "public_api"));

  return app;
}

export const app = createPublicApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<PublicEnv>;
