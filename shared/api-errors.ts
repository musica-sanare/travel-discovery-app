/**
 * Stable API error codes shared by the Workers and the admin UI
 * (contract: docs/DECISIONS.md, ADR-015).
 */
export const API_ERROR_CODES = [
  "invalid_request",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "service_unavailable",
  "ai_unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}
