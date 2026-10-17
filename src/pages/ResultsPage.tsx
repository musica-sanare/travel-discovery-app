import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import type { DiagnosisContentDestination } from "../../shared/diagnosis-content";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../shared/locales";
import type { BudgetStatus, DurationStatus, RankedDestination, SeasonStatus } from "../../domain/diagnosis";
import { buttonClass, cardClass, headingClass, noticeClass } from "../components/classes";
import { ContentStatus } from "../components/ContentStatus";
import { LocalizedText } from "../components/LocalizedText";
import { SEARCH_LINKS } from "../diagnosis/searchLinks";
import { drawSeed, results } from "../diagnosis/session";
import { useDiagnosis } from "../diagnosis/useDiagnosis";

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

type Cost = DiagnosisContentDestination["costs"][number];

function CostLine({ cost, locale }: { cost: Cost; locale: Locale }) {
  const { t } = useTranslation();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: cost.currency, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return (
    <>
      <p className="font-semibold">
        {t("results.cost", {
          period: t(`costPeriods.${cost.period}`),
          min: money.format(cost.min),
          max: money.format(cost.max),
        })}
      </p>
      <p className="text-sm text-muted">{t(`costScopes.${cost.scope}`)}</p>
      {cost.basis && (
        <LocalizedText as="p" locale={cost.basisLocale} className="text-sm">
          {cost.basis}
        </LocalizedText>
      )}
      <p className="text-sm text-muted">
        {t("results.costNote", { source: cost.sourceName, date: date.format(new Date(`${cost.updatedAt}T00:00:00Z`)) })}
        {cost.sourceUrl?.startsWith("https://") && (
          <>
            {" "}
            <a href={cost.sourceUrl} target="_blank" rel="noopener noreferrer">
              {t("results.source")}
            </a>
          </>
        )}
      </p>
    </>
  );
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
  const primaryCost = destination.costs.find((item) => item.currency === budgetCurrency) ?? destination.costs[0];
  const { min, max } = destination.recommendedDays;
  const budget = budgetNote(ranked.budget.status);
  const season = seasonNote(ranked.season);
  const duration = durationNote(ranked.duration);
  const notes = [
    budget && t(`results.budget.${budget}`),
    season && t(`results.season.${season}`),
    duration && t(`results.duration.${duration}`),
  ].filter((note): note is string => typeof note === "string");
  const headingId = `result-${destination.slug}`;

  return (
    <li>
      <article aria-labelledby={headingId} className={`${cardClass} flex flex-col gap-3`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="text-xl font-bold">
            <span className="mr-2 inline-block rounded-full bg-accent px-2.5 py-0.5 text-sm text-accent-ink">
              {t("results.rank", { rank: ranked.rank })}
            </span>
            <LocalizedText locale={destination.locale}>{destination.name}</LocalizedText>
            {destination.country.name && (
              <span className="mt-1 block text-base font-normal text-muted">
                <LocalizedText locale={destination.country.locale}>{destination.country.name}</LocalizedText>
              </span>
            )}
          </h2>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("results.fit", { fit: ranked.displayFit })}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${String(ranked.displayFit)}%` }} />
          </div>
        </div>
        {matches.length > 0 && <p>{t("results.matches", { list: list.format(matches) })}</p>}
        <LocalizedText as="p" locale={destination.locale}>
          {destination.summary}
        </LocalizedText>
        {(notes.length > 0 || (min !== null && max !== null)) && (
          <ul className="flex flex-col gap-1 text-sm">
            {min !== null && max !== null && <li>{t("results.days", { min, max })}</li>}
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {primaryCost && (
          <div className="rounded-lg bg-canvas p-3">
            <CostLine cost={primaryCost} locale={locale} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">
            {t("results.search.heading")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {SEARCH_LINKS.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary}>
                {t(`results.search.${link.id}`, { provider: link.provider })}
                <span className="sr-only"> {t("results.search.newTab")}</span>
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
          <p className="text-xs text-muted">
            {t("results.search.note", {
              destination: destination.country.name
                ? t("results.search.place", { name: destination.name, country: destination.country.name })
                : destination.name,
            })}
          </p>
        </div>
        <details className="group rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-accent">
            {t("results.more")}
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4" lang={destination.locale === locale ? undefined : destination.locale}>
            {destination.image && (
              <figure>
                <img
                  src={destination.image.url}
                  alt={destination.image.alt ?? ""}
                  loading="lazy"
                  className="aspect-video w-full rounded-lg object-cover"
                />
                {destination.image.attribution && (
                  <figcaption className="mt-1 text-xs text-muted">
                    {t("results.imageCredit", { credit: destination.image.attribution })}
                  </figcaption>
                )}
              </figure>
            )}
            {destination.highlights.length > 0 && (
              <section>
                <h3 className="font-semibold">{t("results.highlights")}</h3>
                <ul className="mt-1 list-disc pl-5">
                  {destination.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </section>
            )}
            {destination.bestSeason && (
              <section>
                <h3 className="font-semibold">{t("results.bestSeason")}</h3>
                <p>{destination.bestSeason}</p>
              </section>
            )}
            {destination.cautions && (
              <section>
                <h3 className="font-semibold">{t("results.cautions")}</h3>
                <p>{destination.cautions}</p>
              </section>
            )}
            {destination.costs.length > 1 && (
              <section>
                <h3 className="font-semibold">{t("results.costs")}</h3>
                <ul className="mt-1 flex flex-col gap-3">
                  {destination.costs.map((cost) => (
                    <li key={cost.currency}>
                      <CostLine cost={cost} locale={locale} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </details>
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
    <section aria-labelledby="results-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="results-heading" className={headingClass}>
          {t("results.heading")}
        </h1>
        <p className="mt-2 text-sm text-muted">{t("results.fitNote")}</p>
      </div>
      {session.aiAssist && (
        <p role="status" className={noticeClass.info}>
          {t("results.aiUnavailable")}
        </p>
      )}
      {(notices.length > 0 || ranking.excluded.length > 0) && (
        <div className={`${noticeClass.warn} flex flex-col gap-1`} role="note">
          {notices.map((notice) => (
            <p key={notice}>{t(`results.notices.${notice}`)}</p>
          ))}
          {ranking.excluded.length > 0 && <p>{t("results.excluded", { count: ranking.excluded.length })}</p>}
        </div>
      )}
      <ol className="flex flex-col gap-4">
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

      <section aria-labelledby="answers-heading" className={cardClass}>
        <h2 id="answers-heading" className="text-lg font-bold">
          {t("results.answers")}
        </h2>
        <ol className="mt-3 flex flex-col divide-y divide-line">
          {session.answers.map((answer) => {
            const question = questions.get(answer.question);
            if (!question) return null;
            const labels = question.options
              .filter((option) => answer.options.includes(option.value))
              .map((option) => option.label);
            return (
              <li key={answer.question} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <LocalizedText locale={question.locale}>{question.prompt}</LocalizedText>
                  <span className="block text-sm text-muted">
                    {labels.length > 0 ? labels.join(", ") : t("results.skipped")}
                  </span>
                </span>
                <button
                  type="button"
                  className={buttonClass.quiet}
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
      </section>
      <div>
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() => {
            dispatch({ type: "start", seed: drawSeed() });
            reloadContent();
            void navigate("/quiz");
          }}
        >
          {t("results.restart")}
        </button>
      </div>
    </section>
  );
}
