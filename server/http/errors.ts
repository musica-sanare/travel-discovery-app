/**
 * Shared API error contract (docs/DECISIONS.md, ADR-015): clients receive a
 * stable error code and, for validation failures, field paths with issue
 * codes. Internal messages, SQL, and stack traces are never returned.
 */
import type { ApiErrorCode } from "../../shared/api-errors";

export type { ApiErrorCode };

export interface ValidationIssue {
  path: string;
  code: string;
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  service_unavailable: 503,
  ai_unavailable: 503,
  internal_error: 500,
};

export const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly issues: readonly ValidationIssue[] | undefined;

  constructor(code: ApiErrorCode, issues?: readonly ValidationIssue[]) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.issues = issues;
  }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...API_HEADERS, ...headers } });
}

export function errorResponse(
  code: ApiErrorCode,
  issues?: readonly ValidationIssue[],
  headers: Record<string, string> = {},
): Response {
  const body = issues && issues.length > 0 ? { error: code, issues } : { error: code };
  return jsonResponse(body, STATUS_BY_CODE[code], headers);
}

function causeMessage(error: unknown): string {
  let current: unknown = error;
  const messages: string[] = [];
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

/**
 * Maps any thrown value to a safe response. Database constraint violations
 * become 409/400; other D1/platform failures (including Free-plan daily limits)
 * become 503. Only the error class and mapped code are logged.
 */
export function toErrorResponse(error: unknown, context: string): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.issues);
  }

  const message = causeMessage(error);
  if (message.includes("UNIQUE constraint failed")) {
    return errorResponse("conflict");
  }
  if (message.includes("FOREIGN KEY constraint failed") || message.includes("CHECK constraint failed")) {
    return errorResponse("invalid_request");
  }

  const isDatabaseError = message.includes("D1_") || message.includes("SQLITE_");
  const code: ApiErrorCode = isDatabaseError ? "service_unavailable" : "internal_error";
  console.error(
    JSON.stringify({
      event: "api_error",
      context,
      code,
      errorName: error instanceof Error ? error.name : typeof error,
    }),
  );
  return errorResponse(code);
}
