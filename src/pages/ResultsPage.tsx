import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { DEFAULT_LOCALE, isLocale } from "../../shared/locales";
import type { BudgetStatus, DurationStatus, RankedDestination, SeasonStatus } from "../../domain/diagnosis";
import { ContentStatus } from "../components/ContentStatus";
import { LocalizedText } from "../components/LocalizedText";
import { drawSeed, results } from "../diagnosis/session";
import { useDiagnosis } from "../diagnosis/useDiagnosis";
import type { DiagnosisContentDestination } from "../../shared/diagnosis-content";

/** Statuses worth a note; "not_applicable" means the user gave no input, "over" is excluded. */
function budgetNote(status: BudgetStatus) {
  return status === "not_applicable" || status === "over" ? null : status;
}
function seasonNote(status: SeasonStatus) {
  return status === "not_applicable" ? null : status;
}
function durationNote(status: DurationStatus) {
  return status === "not_applicable" ? null : status;
}

function ResultItem({
  ranked,
  destination,
  attributeNames,
  budgetCurrency,
}: {
  ranked: RankedDestination;
  destination: DiagnosisContentDestination;
  attributeNames: ReadonlyMap<string, string>;
  budgetCurrency: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const matches = ranked.topAttributes.flatMap((item) => attributeNames.get(item.attribute) ?? []);
  const cost =
    destination.costs.find((item) => item.currency === budgetCurrency) ?? destination.costs[0];
  const money = cost
    ? new Intl.NumberFormat(locale, { style: "currency", currency: cost.currency, maximumFractionDigits: 0 })
    : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const { min, max } = destination.recommendedDays;
  const budget = budgetNote(ranked.budget.status);
  const season = seasonNote(ranked.season);
  const duration = durationNote(ranked.duration);

  return (
    <li>
      <article aria-labelledby={`result-${destination.slug}`}>
        <h2 id={`result-${destination.slug}`}>
          {ranked.rank}. <LocalizedText locale={destination.locale}>{destination.name}</LocalizedText>
          {destination.country.name && (
            <>
              {" "}
              (<LocalizedText locale={destination.country.locale}>{destination.country.name}</LocalizedText>)
            </>
          )}
        </h2>
        <p>{t("results.fit", { fit: ranked.displayFit })}</p>
        {matches.length > 0 && <p>{t("results.matches", { list: list.format(matches) })}</p>}
        <LocalizedText as="p" locale={destination.locale}>
          {destination.summary}
        </LocalizedText>
        {min !== null && max !== null && <p>{t("results.days", { min, max })}</p>}
        <ul>
          {budget && <li>{t(`results.budget.${budget}`)}</li>}
          {season && <li>{t(`results.season.${season}`)}</li>}
          {duration && <li>{t(`results.duration.${duration}`)}</li>}
        </ul>
        {cost && money && (
          <p>
            {t("results.cost", {
              period: t(`costPeriods.${cost.period}`),
              min: money.format(cost.min),
              max: money.format(cost.max),
            })}
            <br />
            <small>
              {t("results.costNote", { source: cost.sourceName, date: date.format(new Date(`${cost.updatedAt}T00:00:00Z`)) })}
            </small>
          </p>
        )}
      </article>
    </li>
  );
}

export function ResultsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, dispatch, content, reloadContent, snapshot, engine, step } = useDiagnosis();
  const ranking = useMemo(
    () => (snapshot && engine ? results(engine, snapshot.settings, session) : null),
    [snapshot, engine, session],
  );

  if (session.seed === null) {
    return <Navigate to="/plan" replace />;
  }
  if (!snapshot || !ranking || !step) {
    return <ContentStatus content={content} onRetry={reloadContent} />;
  }
  if (!step.done) {
    return <Navigate to="/quiz" replace />;
  }

  const destinations = new Map(snapshot.destinations.map((item) => [item.slug, item]));
  const questions = new Map(snapshot.questions.map((item) => [item.slug, item]));
  const attributeNames = new Map(snapshot.attributes.map((item) => [item.slug, item.name]));
  const notices = [...ranking.notices, ...(step.insufficientQuestions ? (["insufficient_questions"] as const) : [])];

  return (
    <section aria-labelledby="results-heading">
      <h1 id="results-heading">{t("results.heading")}</h1>
      <p className="notice">{t("results.fitNote")}</p>
      {session.aiAssist && <p role="status">{t("results.aiUnavailable")}</p>}
      {notices.map((notice) => (
        <p key={notice} role="note">
          {t(`results.notices.${notice}`)}
        </p>
      ))}
      {ranking.excluded.length > 0 && <p role="note">{t("results.excluded", { count: ranking.excluded.length })}</p>}
      <ol className="results">
        {ranking.results.map((ranked) => {
          const destination = destinations.get(ranked.slug);
          return destination ? (
            <ResultItem
              key={ranked.slug}
              ranked={ranked}
              destination={destination}
              attributeNames={attributeNames}
              budgetCurrency={session.constraints.budget?.currency}
            />
          ) : null;
        })}
      </ol>

      <h2>{t("results.answers")}</h2>
      <ol>
        {session.answers.map((answer) => {
          const question = questions.get(answer.question);
          if (!question) return null;
          const labels = question.options.filter((option) => answer.options.includes(option.value)).map((o) => o.label);
          return (
            <li key={answer.question}>
              <LocalizedText locale={question.locale}>{question.prompt}</LocalizedText>: {labels.length > 0 ? labels.join(", ") : t("results.skipped")}{" "}
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "editAnswer", question: answer.question });
                  void navigate("/quiz");
                }}
              >
                {t("results.edit")}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => {
          dispatch({ type: "start", seed: drawSeed() });
          reloadContent();
          void navigate("/quiz");
        }}
      >
        {t("results.restart")}
      </button>
    </section>
  );
}
