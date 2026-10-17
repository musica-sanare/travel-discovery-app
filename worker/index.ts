/**
 * API entry point. Only requests matching `assets.run_worker_first` in
 * wrangler.jsonc (`/api/*`) reach this Worker; static assets and SPA routes are
 * served by the Workers static-assets layer without invoking it.
 */

// `public/_headers` does not apply to Worker-generated responses, so API
// security headers are set here.
const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...API_HEADERS, ...headers } });
}

export function handleApiRequest(request: Request): Response {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
    }
    return jsonResponse({ status: "ok" });
  }

  return jsonResponse({ error: "not_found" }, 404);
}

export default {
  fetch(request) {
    return handleApiRequest(request);
  },
} satisfies ExportedHandler;
