import { useEffect, useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AI_CLIENT_QUOTA } from "../../shared/ai-quota";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "../../shared/costs";
import { MONTHS } from "../../shared/months";
import { buttonClass, chipClass, fieldClass, headingClass, ticketLabelClass } from "../components/classes";
import { Barcode, PlaneIcon } from "../components/Decorations";
import { useAiSiteStatus } from "../diagnosis/aiStatus";
import { parseConstraints, type ConstraintsDraft } from "../diagnosis/constraintsForm";
import { useQuizSession } from "../diagnosis/quizSessionContext";
import { drawSeed } from "../diagnosis/session";

const sectionClass = "flex flex-col gap-1 px-5 py-5 sm:px-6";
const fieldCodeClass = `${ticketLabelClass} text-muted`;

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
  const aiStatus = useAiSiteStatus();
  const aiOff = aiStatus === "off";
  const daysError = errors.includes("days");
  const budgetError = errors.includes("budget");

  // A choice made before the status arrived must not send a request the site refuses anyway.
  useEffect(() => {
    if (aiOff && session.aiAssist) {
      dispatch({ type: "setAiAssist", enabled: false });
    }
  }, [aiOff, session.aiAssist, dispatch]);

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
        <p aria-hidden="true" className={`${ticketLabelClass} text-accent`}>
          {t("ticket.checkIn")}
        </p>
        <h1 id={`${id}-heading`} className={`${headingClass} mt-1`}>
          {t("plan.heading")}
        </h1>
        <p className="mt-2 text-muted">{t("plan.lead")}</p>
      </div>
      <form noValidate onSubmit={submit} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-md">
        <div aria-hidden="true" className="on-sky flex items-center justify-between bg-sky px-5 py-3 sm:px-6">
          <span className={`${ticketLabelClass} text-sun`}>{t("ticket.boardingPass")}</span>
          <PlaneIcon className="size-5 rotate-90 text-sun" />
        </div>

        <div className="divide-y divide-dashed divide-line">
          <div className={sectionClass}>
            <span aria-hidden="true" className={fieldCodeClass}>
              {t("ticket.fieldDays")}
            </span>
            <label htmlFor={`${id}-days`} className="font-semibold">
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
                className={`${fieldClass} w-28 text-center font-mono text-lg`}
              />
              <span>{t("plan.daysUnit")}</span>
            </div>
            {daysError && (
              <p id={`${id}-days-error`} className="mt-2 text-sm font-semibold text-warn-ink">
                {t("plan.invalidDays")}
              </p>
            )}
          </div>

          <fieldset className={sectionClass}>
            <legend className="float-left w-full">
              <span aria-hidden="true" className={`${fieldCodeClass} block`}>
                {t("ticket.fieldMonths")}
              </span>
              <span className="font-semibold">{t("plan.months")}</span>{" "}
              <span className="text-muted">{t("common.optional")}</span>
            </legend>
            <div className="clear-both mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {MONTHS.map((month) => (
                <label key={month} htmlFor={`${id}-month-${String(month)}`} className={chipClass}>
                  <input
                    id={`${id}-month-${String(month)}`}
                    type="checkbox"
                    checked={draft.months.includes(month)}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        months: event.target.checked
                          ? [...draft.months, month]
                          : draft.months.filter((m) => m !== month),
                      });
                    }}
                    className="size-4 shrink-0"
                  />
                  {monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)))}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={sectionClass} aria-describedby={`${id}-budget-hint`}>
            <legend className="float-left w-full">
              <span aria-hidden="true" className={`${fieldCodeClass} block`}>
                {t("ticket.fieldBudget")}
              </span>
              <span className="font-semibold">{t("plan.budget")}</span>{" "}
              <span className="text-muted">{t("common.optional")}</span>
            </legend>
            <p id={`${id}-budget-hint`} className="clear-both pt-1 text-sm text-muted">
              {t("plan.budgetHint")}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex min-w-40 flex-1 flex-col gap-1 sm:flex-none">
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
                  className={`${fieldClass} w-full font-mono sm:w-48`}
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
                  className={`${fieldClass} w-28 font-mono`}
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

          <div className={sectionClass}>
            <span aria-hidden="true" className={fieldCodeClass}>
              {t("ticket.fieldAssist")}
            </span>
            <div className="flex items-start justify-between gap-4">
              <label htmlFor={`${id}-ai`} className="font-semibold">
                {t("plan.ai")}
              </label>
              {/* A native checkbox drawn as a switch; it sits on top so it receives clicks and focus. */}
              <span className="relative inline-flex h-7 w-12 shrink-0">
                <input
                  id={`${id}-ai`}
                  type="checkbox"
                  checked={session.aiAssist && !aiOff}
                  disabled={aiOff}
                  aria-describedby={aiOff ? `${id}-ai-off ${id}-ai-hint ${id}-ai-limits` : `${id}-ai-hint ${id}-ai-limits`}
                  onChange={(event) => {
                    dispatch({ type: "setAiAssist", enabled: event.target.checked });
                  }}
                  className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-accent peer-disabled:opacity-40"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5"
                />
              </span>
            </div>
            {aiOff && (
              <p id={`${id}-ai-off`} className="mt-1 text-sm font-semibold">
                {t("plan.aiOff")}
              </p>
            )}
            <p id={`${id}-ai-hint`} className="mt-1 text-sm text-muted">
              {t("plan.aiHint")}
            </p>
            <p id={`${id}-ai-limits`} className="mt-1 text-sm text-muted">
              {t("plan.aiLimits", { perWindow: AI_CLIENT_QUOTA.perWindow, perDay: AI_CLIENT_QUOTA.perUtcDay })}
            </p>
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-4 border-t-2 border-dashed border-line bg-canvas/60 px-5 py-5 sm:px-6">
          <span aria-hidden="true" className="absolute -top-3 -left-3 size-6 rounded-full border border-line bg-canvas" />
          <span aria-hidden="true" className="absolute -top-3 -right-3 size-6 rounded-full border border-line bg-canvas" />
          <button type="submit" className={buttonClass.primary}>
            <PlaneIcon className="size-5 rotate-45" />
            {t("plan.submit")}
          </button>
          <Barcode className="hidden h-10 w-36 text-ink/70 sm:block" />
        </div>
      </form>
    </section>
  );
}
