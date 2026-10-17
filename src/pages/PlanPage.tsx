import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "../../shared/costs";
import { MONTHS } from "../../shared/months";
import { buttonClass, cardClass, choiceClass, fieldClass, headingClass } from "../components/classes";
import { parseConstraints, type ConstraintsDraft } from "../diagnosis/constraintsForm";
import { useQuizSession } from "../diagnosis/quizSessionContext";
import { drawSeed } from "../diagnosis/session";

export function PlanPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const id = useId();
  const { session, dispatch, reloadContent } = useQuizSession();
  const [draft, setDraft] = useState<ConstraintsDraft>(() => ({
    days: session.constraints.days?.toString() ?? "",
    months: [...(session.constraints.months ?? [])],
    budgetAmount: session.constraints.budget?.amount.toString() ?? "",
    budgetCurrency: session.constraints.budget?.currency ?? DEFAULT_CURRENCY,
  }));
  const [errors, setErrors] = useState<("days" | "budget")[]>([]);
  const monthFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: "long", timeZone: "UTC" });
  const daysError = errors.includes("days");
  const budgetError = errors.includes("budget");

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = parseConstraints(draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    dispatch({ type: "setConstraints", constraints: parsed.constraints });
    dispatch({ type: "start", seed: drawSeed() });
    reloadContent();
    void navigate("/quiz");
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-6">
      <div>
        <h1 id={`${id}-heading`} className={headingClass}>
          {t("plan.heading")}
        </h1>
        <p className="mt-2 text-muted">{t("plan.lead")}</p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <div className={cardClass}>
          <label htmlFor={`${id}-days`} className="block font-semibold">
            {t("plan.days")} <span className="font-normal text-muted">{t("common.optional")}</span>
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id={`${id}-days`}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={draft.days}
              aria-invalid={daysError}
              aria-describedby={daysError ? `${id}-days-error` : undefined}
              onChange={(event) => {
                setDraft({ ...draft, days: event.target.value });
              }}
              className={`${fieldClass} w-28 sm:w-28`}
            />
            <span>{t("plan.daysUnit")}</span>
          </div>
          {daysError && (
            <p id={`${id}-days-error`} className="mt-2 text-sm font-semibold text-warn-ink">
              {t("plan.invalidDays")}
            </p>
          )}
        </div>

        <fieldset className={cardClass}>
          <legend className="float-left mb-3 w-full font-semibold">
            {t("plan.months")} <span className="font-normal text-muted">{t("common.optional")}</span>
          </legend>
          <div className="clear-both grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MONTHS.map((month) => (
              <label key={month} htmlFor={`${id}-month-${String(month)}`} className={choiceClass}>
                <input
                  id={`${id}-month-${String(month)}`}
                  type="checkbox"
                  checked={draft.months.includes(month)}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      months: event.target.checked ? [...draft.months, month] : draft.months.filter((m) => m !== month),
                    });
                  }}
                  className="size-4"
                />
                {monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)))}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={cardClass} aria-describedby={`${id}-budget-hint`}>
          <legend className="float-left w-full font-semibold">
            {t("plan.budget")} <span className="font-normal text-muted">{t("common.optional")}</span>
          </legend>
          <p id={`${id}-budget-hint`} className="clear-both pt-1 text-sm text-muted">
            {t("plan.budgetHint")}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-budget`} className="text-sm">
                {t("plan.budgetAmount")}
              </label>
              <input
                id={`${id}-budget`}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.budgetAmount}
                aria-invalid={budgetError}
                aria-describedby={budgetError ? `${id}-budget-error` : undefined}
                onChange={(event) => {
                  setDraft({ ...draft, budgetAmount: event.target.value });
                }}
                className={`${fieldClass} sm:w-48`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-currency`} className="text-sm">
                {t("plan.currency")}
              </label>
              <select
                id={`${id}-currency`}
                value={draft.budgetCurrency}
                onChange={(event) => {
                  const currency = SUPPORTED_CURRENCIES.find((value) => value === event.target.value);
                  if (currency) setDraft({ ...draft, budgetCurrency: currency });
                }}
                className={fieldClass}
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {budgetError && (
            <p id={`${id}-budget-error`} className="mt-2 text-sm font-semibold text-warn-ink">
              {t("plan.invalidBudget")}
            </p>
          )}
        </fieldset>

        <div className={cardClass}>
          <label htmlFor={`${id}-ai`} className="flex items-center gap-3 font-semibold">
            <input
              id={`${id}-ai`}
              type="checkbox"
              checked={session.aiAssist}
              aria-describedby={`${id}-ai-hint`}
              onChange={(event) => {
                dispatch({ type: "setAiAssist", enabled: event.target.checked });
              }}
              className="size-5"
            />
            {t("plan.ai")}
          </label>
          <p id={`${id}-ai-hint`} className="mt-2 text-sm text-muted">
            {t("plan.aiHint")}
          </p>
        </div>

        <div>
          <button type="submit" className={buttonClass.primary}>
            {t("plan.submit")}
          </button>
        </div>
      </form>
    </section>
  );
}
