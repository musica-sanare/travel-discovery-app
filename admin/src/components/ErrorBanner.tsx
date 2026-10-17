import { useTranslation } from "react-i18next";
import { AdminApiError } from "../api";

const KNOWN_ISSUE_CODES = [
  "too_small",
  "too_big",
  "invalid_type",
  "invalid_format",
  "invalid_value",
  "unrecognized_keys",
  "invalid_json",
  "base_locale_required",
  "at_least_one_translation",
  "cost_basis_required",
  "image_alt_required",
  "min_exceeds_max",
  "duplicate_attribute",
  "duplicate_value",
  "duplicate_currency",
  "duplicate_month",
  "min_two_options",
  "zero_weight",
  "target_below_min",
  "target_above_max",
] as const;

type IssueCode = (typeof KNOWN_ISSUE_CODES)[number] | "other";

function isKnownIssueCode(code: string): code is (typeof KNOWN_ISSUE_CODES)[number] {
  return (KNOWN_ISSUE_CODES as readonly string[]).includes(code);
}

function toIssueCode(code: string): IssueCode {
  return isKnownIssueCode(code) ? code : "other";
}

/** Shows a localized API error and, for validation errors, each field issue. */
export function ErrorBanner({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (error === null || error === undefined) {
    return null;
  }
  const apiError = error instanceof AdminApiError ? error : new AdminApiError("unknown");

  return (
    <div className="error-banner" role="alert">
      <p>
        <strong>{t("errors.title")}: </strong>
        {t(`errors.${apiError.code}`)}
      </p>
      {apiError.issues.length > 0 && (
        <ul>
          {apiError.issues.map((issue) => (
            <li key={`${issue.path}:${issue.code}`}>
              <code>{issue.path || "—"}</code>: {t(`issues.${toIssueCode(issue.code)}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
