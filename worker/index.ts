/**
 * Public Worker. Only requests matching `assets.run_worker_first` in
 * wrangler.jsonc (`/api/*`) reach this Worker; static assets and SPA routes are
 * served by the Workers static-assets layer without invoking it.
 *
 * This Worker is read-only: it serves GET/HEAD, plus the read-only
 * `POST /api/ai/explanations` (docs/DECISIONS.md ADR-026), and imports read
 * modules only. That is a code-level constraint (ADR-018), not a database
 * permission.
 */
import { Hono } from "hono";
import { AI_EXPLANATIONS_PATH, aiExplanationRequestSchema } from "../shared/ai-explanation";
import type { ExplanationProvider } from "../server/ai/provider";
import { createDatabase } from "../server/db/client";
import { errorResponse, jsonResponse, toErrorResponse } from "../server/http/errors";
import { hasSameOrigin, parseLocaleParam, readJsonBody } from "../server/http/request";
import { isSlug } from "../shared/slug";
import { explainDiagnosis } from "../server/public/ai-explanations";
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
}

/** Same shape as the Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AiDependencies {
  /** null: AI is unavailable (503 ai_unavailable). */
  provider: ExplanationProvider | null;
  /** Per-client limiter, keyed by the client IP address; null: not applied. */
  clientLimiter: RateLimiter | null;
  /** Limiter shared by all clients; null: not applied. */
  globalLimiter: RateLimiter | null;
  timeoutMs?: number;
}

export interface PublicAppOptions {
  /** Resolves AI dependencies per request. No provider is wired yet (ADR-026 Stage 3). */
  aiDependencies?: (env: PublicEnv) => AiDependencies;
}

const READ_METHODS = new Set(["GET", "HEAD"]);

const NO_AI: AiDependencies = { provider: null, clientLimiter: null, globalLimiter: null };

function logAiEvent(entry: object): void {
  console.log(JSON.stringify(entry));
}

async function withinRateLimits(dependencies: AiDependencies, request: Request): Promise<boolean> {
  const checks: Promise<{ success: boolean }>[] = [];
  if (dependencies.globalLimiter) {
    checks.push(dependencies.globalLimiter.limit({ key: "global" }));
  }
  if (dependencies.clientLimiter) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    checks.push(dependencies.clientLimiter.limit({ key: `ip:${ip}` }));
  }
  const results = await Promise.all(checks);
  return results.every((result) => result.success);
}

export function createPublicApp(options: PublicAppOptions = {}) {
  const resolveAi = options.aiDependencies ?? (() => NO_AI);
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
    if (c.env.AI_ASSIST_ENABLED !== "true" || !dependencies.provider) {
      return errorResponse("ai_unavailable");
    }
    if (!(await withinRateLimits(dependencies, c.req.raw))) {
      return errorResponse("rate_limited");
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
