import type { ValidationIssue } from "./api";
import type { ContentStatus, QuestionType } from "./types";

/**
 * Client-side mirror of the server's publish rule for question types
 * (server/admin/validation.ts, ADR-020). The server remains authoritative.
 */
export function questionPublishIssues(question: {
  status: ContentStatus;
  type: QuestionType;
}): ValidationIssue[] {
  return question.status === "published" && question.type === "multiple_choice"
    ? [{ path: "type", code: "question_type_not_publishable" }]
    : [];
}
