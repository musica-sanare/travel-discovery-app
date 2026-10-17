/**
 * Public Worker. Only requests matching `assets.run_worker_first` in
 * wrangler.jsonc (`/api/*`) reach this Worker; static assets and SPA routes are
 * served by the Workers static-assets layer without invoking it.
 *
 * This Worker is read-only: it serves GET/HEAD only and imports read modules
 * only. That is a code-level constraint (ADR-018), not a database permission.
 */
import { Hono } from "hono";
import { createDatabase } from "../server/db/client";
import { errorResponse, jsonResponse, toErrorResponse } from "../server/http/errors";
import { parseLocaleParam } from "../server/http/request";
import { isSlug } from "../shared/slug";
import {
  getPublishedDestination,
  listPublishedDestinations,
  listPublishedQuestions,
} from "../server/public/content";

export interface PublicEnv {
  PUBLIC_DB: D1Database;
}

const READ_METHODS = new Set(["GET", "HEAD"]);

export const app = new Hono<{ Bindings: PublicEnv }>();

app.use("*", async (c, next) => {
  if (!READ_METHODS.has(c.req.method)) {
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

app.notFound(() => errorResponse("not_found"));
app.onError((error) => toErrorResponse(error, "public_api"));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<PublicEnv>;
