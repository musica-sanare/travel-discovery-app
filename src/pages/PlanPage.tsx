import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, type Currency } from "../../shared/costs";
import { MONTHS } from "../../shared/months";
import { useQuizSession } from "../diagnosis/quizSessionContext";
import { drawSeed } from "../diagnosis/session";
import { parseConstraints, type ConstraintsDraft } from "../diagnosis/constraintsForm";

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
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`}>{t("plan.heading")}</h1>
      <p>{t("plan.lead")}</p>
      <form noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor={`${id}-days`}>
            {t("plan.days")} {t("common.optional")}
          </label>
          <input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={draft.days}
            aria-invalid={errors.includes("days")}
            aria-describedby={errors.includes("days") ? `${id}-days-error` : undefined}
            onChange={(event) => {
              setDraft({ ...draft, days: event.target.value });
            }}
          />{" "}
          {t("plan.daysUnit")}
          {errors.includes("days") && <p id={`${id}-days-error`}>{t("plan.invalidDays")}</p>}
        </div>

        <fieldset>
          <legend>
            {t("plan.months")} {t("common.optional")}
          </legend>
          {MONTHS.map((month) => (
            <label key={month} className="choice">
              <input
                type="checkbox"
                checked={draft.months.includes(month)}
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    months: event.target.checked ? [...draft.months, month] : draft.months.filter((m) => m !== month),
                  });
                }}
              />
              {monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)))}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>
            {t("plan.budget")} {t("common.optional")}
          </legend>
          <p id={`${id}-budget-hint`}>{t("plan.budgetHint")}</p>
          <label htmlFor={`${id}-budget`}>{t("plan.budget")}</label>
          <input
            id={`${id}-budget`}
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.budgetAmount}
            aria-invalid={errors.includes("budget")}
            aria-describedby={`${id}-budget-hint${errors.includes("budget") ? ` ${id}-budget-error` : ""}`}
            onChange={(event) => {
              setDraft({ ...draft, budgetAmount: event.target.value });
            }}
          />
          <label htmlFor={`${id}-currency`}>{t("plan.currency")}</label>
          <select
            id={`${id}-currency`}
            value={draft.budgetCurrency}
            onChange={(event) => {
              const currency = SUPPORTED_CURRENCIES.find((value) => value === event.target.value);
              if (currency) setDraft({ ...draft, budgetCurrency: currency satisfies Currency });
            }}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          {errors.includes("budget") && <p id={`${id}-budget-error`}>{t("plan.invalidBudget")}</p>}
        </fieldset>

        <div className="field">
          <label className="choice">
            <input
              type="checkbox"
              checked={session.aiAssist}
              aria-describedby={`${id}-ai-hint`}
              onChange={(event) => {
                dispatch({ type: "setAiAssist", enabled: event.target.checked });
              }}
            />
            {t("plan.ai")}
          </label>
          <p id={`${id}-ai-hint`} className="notice">
            {t("plan.aiHint")}
          </p>
        </div>

        <button type="submit">{t("plan.submit")}</button>
      </form>
    </section>
  );
}
