import { isApiErrorCode, type ApiErrorCode } from "../../shared/api-errors";

export interface ValidationIssue {
  path: string;
  code: string;
}

/** A failed admin API call; `code` is "network" when no response arrived. */
export class AdminApiError extends Error {
  readonly code: ApiErrorCode | "network" | "unknown";
  readonly issues: readonly ValidationIssue[];

  constructor(code: AdminApiError["code"], issues: readonly ValidationIssue[] = []) {
    super(code);
    this.name = "AdminApiError";
    this.code = code;
    this.issues = issues;
  }
}

function parseIssues(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const path: unknown = Reflect.get(item, "path");
    const code: unknown = Reflect.get(item, "code");
    return typeof path === "string" && typeof code === "string" ? [{ path, code }] : [];
  });
}

/**
 * Calls the admin API on the same origin. Authorization is enforced by the
 * server (Access JWT); this client only surfaces errors.
 */
export async function adminApi<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    throw new AdminApiError("network");
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "error") : null;
    const issues: unknown =
      typeof data === "object" && data !== null ? Reflect.get(data, "issues") : null;
    throw new AdminApiError(isApiErrorCode(code) ? code : "unknown", parseIssues(issues));
  }
  // The same-origin admin API is trusted to return the documented shape; inputs
  // are validated server-side (server/admin/validation.ts).
  return data as T;
}
