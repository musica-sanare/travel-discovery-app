/** Mapping of thrown errors to the API error contract (docs/DECISIONS.md ADR-015). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "../../server/http/errors";

// Message texts from https://developers.cloudflare.com/d1/observability/debug-d1/
// (checked 2026-10-19); the binding throws an Error whose message starts with
// the D1_ERROR prefix.
const D1_DAILY_READ_LIMIT =
  "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";
const D1_DAILY_WRITE_LIMIT =
  "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toErrorResponse", () => {
  it.each([
    ["daily row read limit", new Error(D1_DAILY_READ_LIMIT), 503, "service_unavailable"],
    ["daily row write limit", new Error(D1_DAILY_WRITE_LIMIT), 503, "service_unavailable"],
    ["D1 error in the cause chain", new Error("query failed", { cause: new Error(D1_DAILY_READ_LIMIT) }), 503, "service_unavailable"],
    ["SQLite error", new Error("SQLITE_BUSY: database is locked"), 503, "service_unavailable"],
    ["unique constraint", new Error("D1_ERROR: UNIQUE constraint failed: destinations.slug"), 409, "conflict"],
    ["check constraint", new Error("D1_ERROR: CHECK constraint failed: status"), 400, "invalid_request"],
    ["unexpected error", new Error("boom"), 500, "internal_error"],
    ["non-Error value", "boom", 500, "internal_error"],
  ])("maps %s", async (_name, error, status, code) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = toErrorResponse(error, "test");

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    for (const [line] of log.mock.calls) {
      expect(String(line)).not.toContain("exceeded");
    }
  });
});
