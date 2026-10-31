import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Navigate, useNavigate } from "react-router";
import type { DiagnosisContentDestination } from "../../shared/diagnosis-content";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../shared/locales";
import type { BudgetStatus, DurationStatus, RankedDestination, SeasonStatus } from "../../domain/diagnosis";
import { buttonClass, cardClass, headingClass, noticeClass, ticketLabelClass } from "../components/classes";
import { ContentStatus } from "../components/ContentStatus";
import { Barcode } from "../components/Decorations";
import { DestinationBand } from "../components/DestinationBand";
import { LocalizedText } from "../components/LocalizedText";
import { SEARCH_LINKS } from "../diagnosis/searchLinks";
import { drawSeed, results } from "../diagnosis/session";
import { buildAiRequest, useAiExplanations, type AiExplanationState } from "../diagnosis/useAiExplanations";
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

const AI_STATUS_KEYS = {
  loading: "results.ai.loading",
  ready: "results.ai.ready",
  unavailable: "results.ai.unavailable",
  content_changed: "results.ai.contentChanged",
  rate_limited: "results.ai.rateLimited",
  rate_limited_window: "results.ai.rateLimitedWindow",
} as const;

/** The daily reset (00:00 UTC) is shown in the device's time zone, with the zone named. */
function aiStatusText(t: TFunction, state: Exclude<AiExplanationState, { status: "off" }>, locale: Locale) {
  if (state.status !== "failed") {
    return t(AI_STATUS_KEYS[state.status]);
  }
  if (state.reason === "rate_limited_daily") {
    const retryAt = new Date(state.retryAt);
    return t("results.ai.rateLimitedDaily", {
      date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(retryAt),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(retryAt),
    });
  }
  return t(AI_STATUS_KEYS[state.reason]);
}

function CostLine({ cost, locale }: { cost: Cost; locale: Locale }) {
  const { t } = useTranslation();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: cost.currency, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return (
    <>
      <p className="font-semibold">
        {cost.min === cost.max
          ? t("results.costSingle", { period: t(`costPeriods.${cost.period}`), amount: money.format(cost.min) })
          : t("results.cost", {
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
              <span className="sr-only"> {t("results.search.newTab")}</span>
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
  aiText,
}: {
  ranked: RankedDestination;
  destination: DiagnosisContentDestination;
  attributeNames: ReadonlyMap<string, string>;
  budgetCurrency: string | undefined;
  /** Optional AI-generated note; shown in addition to, never instead of, the deterministic explanation. */
  aiText: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
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
      <article
        aria-labelledby={headingId}
        className="grid overflow-hidden rounded-2xl border border-line bg-surface shadow-md md:grid-cols-[minmax(0,1fr)_15rem]"
      >
        <div className="md:col-span-2">
          <DestinationBand slug={destination.slug} type={destination.type} rank={ranked.rank} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <h2 id={headingId} className="text-2xl font-extrabold tracking-tight">
            <span className="mr-2 inline-block rounded-full bg-accent px-2.5 py-0.5 align-middle text-sm font-bold text-accent-ink">
              {t("results.rank", { rank: ranked.rank })}
            </span>
            <LocalizedText locale={destination.locale}>{destination.name}</LocalizedText>
            {destination.country.name && (
              <span className="mt-1 block text-base font-medium text-muted">
                <LocalizedText locale={destination.country.locale}>{destination.country.name}</LocalizedText>
              </span>
            )}
          </h2>
          <LocalizedText as="p" locale={destination.locale}>
            {destination.summary}
          </LocalizedText>
          {matches.length > 0 && (
            <div>
              <p className="text-sm font-semibold">{t("results.matchesLabel")}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {matches.map((match) => (
                  <li key={match} className="rounded-full bg-match-soft px-3 py-1 text-sm font-medium text-match-ink">
                    {match}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <ul className="flex flex-col gap-1 border-l-2 border-line pl-3 text-sm">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {aiText !== undefined && (
            <div className="rounded-lg border border-line p-3">
              <h3 className="text-sm font-semibold">{t("results.ai.heading")}</h3>
              <p className="mt-1">{aiText}</p>
              <p className="mt-1 text-xs text-muted">{t("results.ai.label")}</p>
            </div>
          )}
          {primaryCost && (
            <div className="rounded-lg border border-dashed border-line bg-canvas p-3">
              <p className="mb-1">
                <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-ink">
                  {t("results.indicative")}
                </span>
              </p>
              <CostLine cost={primaryCost} locale={locale} />
            </div>
          )}
        </div>

        <div className="relative flex flex-col gap-4 border-t-2 border-dashed border-line bg-canvas/60 p-5 sm:p-6 md:border-t-0 md:border-l-2">
          <span
            aria-hidden="true"
            className="absolute -top-3 -left-3 size-6 rounded-full border border-line bg-canvas md:hidden"
          />
          <span
            aria-hidden="true"
            className="absolute -top-3 -right-3 size-6 rounded-full border border-line bg-canvas md:hidden"
          />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
            <div>
              <p aria-hidden="true" className={`${ticketLabelClass} text-muted`}>
                {t("ticket.fit")}
              </p>
              <p aria-hidden="true" className="font-mono text-4xl font-bold text-accent">
                {ranked.displayFit}
              </p>
              <p className="text-sm font-semibold">{t("results.fit", { fit: ranked.displayFit })}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${String(ranked.displayFit)}%` }} />
              </div>
            </div>
            {min !== null && max !== null && (
              <div>
                <p aria-hidden="true" className={`${ticketLabelClass} text-muted`}>
                  {t("ticket.stay")}
                </p>
                <p className="mt-1 text-sm font-semibold">{t("results.days", { min, max })}</p>
              </div>
            )}
          </div>
          <Barcode className="mt-auto hidden h-12 w-full text-ink/60 md:block" />
        </div>

        <div className="flex flex-col gap-4 border-t border-line p-5 sm:p-6 md:col-span-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("results.search.heading")}</h3>
            <div className="flex flex-wrap gap-2">
              {SEARCH_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass.secondary}
                >
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
                    // Admin-entered images are third-party URLs; send no referrer (ADR-017).
                    referrerPolicy="no-referrer"
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
        </div>
      </article>
    </li>
  );
}

export function ResultsPage() {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const navigate = useNavigate();
  const { session, dispatch, content, reloadContent, snapshot, engine, step } = useDiagnosis();
  const ranking = useMemo(
    () => (snapshot && engine ? results(engine, snapshot.settings, session) : null),
    [snapshot, engine, session],
  );
  const aiRequest = useMemo(
    () => (snapshot && ranking ? buildAiRequest(snapshot.locale, session.answers, session.constraints, ranking) : null),
    [snapshot, ranking, session.answers, session.constraints],
  );
  const ai = useAiExplanations(session.aiAssist && step?.done === true, aiRequest);

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
        <p aria-hidden="true" className={`${ticketLabelClass} text-accent`}>
          {t("ticket.arrivals")}
        </p>
        <h1 id="results-heading" className={`${headingClass} mt-1`}>
          {t("results.heading")}
        </h1>
        <p className="mt-2 text-sm text-muted">{t("results.fitNote")}</p>
      </div>
      {ai.status !== "off" && (
        <p role="status" className={noticeClass.info}>
          {aiStatusText(t, ai, locale)}
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
      <ol className="flex flex-col gap-6">
        {ranking.results.map((ranked) => {
          const destination = destinations.get(ranked.slug);
          return destination ? (
            <ResultItem
              key={ranked.slug}
              ranked={ranked}
              destination={destination}
              attributeNames={attributeNames}
              budgetCurrency={session.constraints.budget?.currency}
              aiText={ai.status === "ready" ? ai.texts.get(ranked.slug) : undefined}
            />
          ) : null;
        })}
      </ol>

      <section aria-labelledby="answers-heading" className={cardClass}>
        <p aria-hidden="true" className={`${ticketLabelClass} text-muted`}>
          {t("ticket.flightLog")}
        </p>
        <h2 id="answers-heading" className="mt-1 text-lg font-bold">
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
