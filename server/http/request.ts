import type { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../shared/locales";
import { ApiError, type ValidationIssue } from "./errors";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

/** Reads the optional `locale` query parameter; unsupported values are rejected. */
export function parseLocaleParam(url: URL): Locale {
  const value = url.searchParams.get("locale");
  if (value === null || value === "") {
    return DEFAULT_LOCALE;
  }
  if (!isLocale(value)) {
    throw new ApiError("invalid_request", [{ path: "locale", code: "invalid_value" }]);
  }
  return value;
}

/** Parses a positive integer route parameter such as `:id`. */
export function parseIdParam(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]{0,9}$/.test(value)) {
    throw new ApiError("not_found");
  }
  return Number(value);
}

/**
 * Converts Zod issues to `{ path, code }`. Custom rules use stable message
 * codes (e.g. `base_locale_required`), which are returned as the code.
 */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code === "custom" ? issue.message : issue.code,
  }));
}

/**
 * Reads a JSON request body with a size limit and validates it. Only
 * `application/json` is accepted, which (together with the Origin check in the
 * admin Worker) prevents cross-site form submissions.
 */
export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(contentType)) {
    throw new ApiError("unsupported_media_type");
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw new ApiError("payload_too_large");
  }

  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_JSON_BODY_BYTES) {
    throw new ApiError("payload_too_large");
  }

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ApiError("invalid_request", [{ path: "", code: "invalid_json" }]);
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError("invalid_request", toValidationIssues(result.error));
  }
  return result.data;
}
