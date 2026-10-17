import { useId, useState, type SyntheticEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { SUPPORTED_LOCALES, type Locale } from "../../../shared/locales";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { TranslationFieldset } from "../components/TranslationFieldset";
import { toTranslationDraft, type TranslationDraft } from "../components/translationDraft";
import { intOrNull, numberToText, textOrNull } from "../forms";
import { useLoad } from "../hooks";
import { useContentText } from "../localizedContent";
import { MONTHS } from "../../../shared/months";
import {
  CONTENT_STATUSES,
  COST_PERIODS,
  COST_SCOPES,
  DESTINATION_TYPES,
  SUPPORTED_CURRENCIES,
  type ContentStatus,
  type CostPeriod,
  type CostScope,
  type Currency,
  type DestinationDetail,
  type DestinationType,
  type TaxonomyItem,
} from "../types";

type TextKey = "name" | "summary" | "highlights" | "cautions" | "bestSeason" | "imageAlt";

interface CostDraft {
  currency: Currency;
  period: CostPeriod;
  scope: CostScope;
  min: string;
  max: string;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string;
  basis: Partial<Record<Locale, string>>;
}

interface Draft {
  slug: string;
  countryId: string;
  type: DestinationType;
  status: ContentStatus;
  daysMin: string;
  daysMax: string;
  bestMonths: number[];
  costs: CostDraft[];
  hasImage: boolean;
  image: { url: string; attribution: string };
  translations: TranslationDraft<TextKey>;
  scores: Record<number, string>;
}

function newDraft(): Draft {
  return {
    slug: "",
    countryId: "",
    type: "city",
    status: "draft",
    daysMin: "",
    daysMax: "",
    bestMonths: [],
    costs: [],
    hasImage: false,
    image: { url: "", attribution: "" },
    translations: {
      ja: { name: "", summary: "", highlights: "", cautions: "", bestSeason: "", imageAlt: "" },
    },
    scores: {},
  };
}

function newCostDraft(currency: Currency): CostDraft {
  return {
    currency,
    period: "per_day",
    scope: "per_person_excluding_international_flights",
    min: "",
    max: "",
    sourceName: "",
    sourceUrl: "",
    updatedAt: "",
    basis: {},
  };
}

function fromDetail(
  detail: DestinationDetail,
  fields: readonly { key: TextKey; label: string }[],
): Draft {
  const base = newDraft();
  return {
    slug: detail.slug,
    countryId: String(detail.countryId),
    type: detail.type,
    status: detail.status,
    daysMin: numberToText(detail.recommendedDays.min),
    daysMax: numberToText(detail.recommendedDays.max),
    bestMonths: detail.bestMonths,
    costs: detail.costs.map((cost) => ({
      currency: cost.currency,
      period: cost.period,
      scope: cost.scope,
      min: String(cost.min),
      max: String(cost.max),
      sourceName: cost.sourceName,
      sourceUrl: cost.sourceUrl ?? "",
      updatedAt: cost.updatedAt,
      basis: { ...cost.basis },
    })),
    hasImage: detail.image !== null,
    image: detail.image ?? base.image,
    translations: toTranslationDraft(fields, detail.translations),
    scores: Object.fromEntries(detail.attributeScores.map((item) => [item.attributeId, String(item.score)])),
  };
}

function toPayload(draft: Draft) {
  const translations: Partial<Record<Locale, unknown>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const entry = draft.translations[locale];
    if (!entry) continue;
    translations[locale] = {
      name: entry.name,
      summary: entry.summary,
      highlights: entry.highlights
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
      cautions: textOrNull(entry.cautions),
      bestSeason: textOrNull(entry.bestSeason),
      imageAlt: textOrNull(entry.imageAlt),
    };
  }
  return {
    slug: draft.slug.trim(),
    countryId: Number(draft.countryId),
    type: draft.type,
    status: draft.status,
    recommendedDays: { min: intOrNull(draft.daysMin), max: intOrNull(draft.daysMax) },
    bestMonths: [...draft.bestMonths].sort((a, b) => a - b),
    costs: draft.costs.map((cost) => ({
      currency: cost.currency,
      period: cost.period,
      scope: cost.scope,
      min: intOrNull(cost.min),
      max: intOrNull(cost.max),
      sourceName: cost.sourceName,
      sourceUrl: textOrNull(cost.sourceUrl),
      updatedAt: cost.updatedAt,
      basis: Object.fromEntries(
        SUPPORTED_LOCALES.flatMap((locale) => {
          const basis = cost.basis[locale];
          return draft.translations[locale] && basis !== undefined ? [[locale, textOrNull(basis)]] : [];
        }),
      ),
    })),
    image: draft.hasImage ? { url: draft.image.url.trim(), attribution: draft.image.attribution } : null,
    translations,
    attributeScores: Object.entries(draft.scores)
      .filter(([, score]) => score.trim() !== "")
      .map(([attributeId, score]) => ({ attributeId: Number(attributeId), score: intOrNull(score) })),
  };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function DestinationFormPage() {
  const { t, i18n } = useTranslation();
  const monthFormat = new Intl.DateTimeFormat(i18n.language, { month: "long", timeZone: "UTC" });
  const content = useContentText();
  const navigate = useNavigate();
  const params = useParams();
  const editingId = params.id;
  const id = useId();

  const fields: { key: TextKey; label: string; multiline?: boolean; optional?: boolean }[] = [
    { key: "name", label: t("fields.name") },
    { key: "summary", label: t("fields.summary"), multiline: true },
    { key: "highlights", label: t("fields.highlights"), multiline: true, optional: true },
    { key: "cautions", label: t("fields.cautions"), multiline: true, optional: true },
    { key: "bestSeason", label: t("fields.bestSeason"), optional: true },
    { key: "imageAlt", label: t("fields.imageAlt"), optional: true },
  ];

  const references = useLoad(
    async () => {
      const [countries, attributes, detail] = await Promise.all([
        adminApi<{ items: TaxonomyItem[] }>("/countries"),
        adminApi<{ items: TaxonomyItem[] }>("/attributes"),
        editingId ? adminApi<{ item: DestinationDetail }>(`/destinations/${editingId}`) : null,
      ]);
      return { countries: countries.items, attributes: attributes.items, detail: detail?.item };
    },
    `destination:${editingId ?? "new"}`,
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const loadedDraft = references.data?.detail ? fromDetail(references.data.detail, fields) : newDraft();
  const current = draft ?? loadedDraft;
  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...current, ...patch });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const result = await adminApi<{ id: number }>(
        editingId ? `/destinations/${editingId}` : "/destinations",
        { method: editingId ? "PUT" : "POST", body: toPayload(current) },
      );
      setSaved(true);
      if (!editingId) {
        void navigate(`/destinations/${String(result.id)}`, { replace: true });
      }
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const title = editingId ? t("pages.editDestination") : t("pages.newDestination");

  if (references.loading) {
    return <p role="status">{t("common.loading")}</p>;
  }
  if (references.error || !references.data) {
    return (
      <section>
        <h1>{title}</h1>
        <ErrorBanner error={references.error} />
        <button type="button" onClick={references.reload}>
          {t("common.retry")}
        </button>
      </section>
    );
  }
  const { countries, attributes } = references.data;
  const unusedCurrency = SUPPORTED_CURRENCIES.find(
    (currency) => !current.costs.some((cost) => cost.currency === currency),
  );

  return (
    <section aria-labelledby={`${id}-heading`}>
      <p>
        <Link to="/destinations">{t("common.back")}</Link>
      </p>
      <h1 id={`${id}-heading`}>{title}</h1>
      <form className="editor" onSubmit={(event) => void submit(event)}>
        <ErrorBanner error={saveError} />
        {saved && <p role="status">{t("common.saved")}</p>}

        <Field id={`${id}-slug`} label={t("fields.slug")}>
          <input
            id={`${id}-slug`}
            value={current.slug}
            required
            onChange={(event) => {
              update({ slug: event.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-country`} label={t("fields.country")}>
          <select
            id={`${id}-country`}
            value={current.countryId}
            required
            onChange={(event) => {
              update({ countryId: event.target.value });
            }}
          >
            <option value="">{t("common.noneSelected")}</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {content.name(country.translations) ?? country.slug}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-type`} label={t("fields.type")}>
          <select
            id={`${id}-type`}
            value={current.type}
            onChange={(event) => {
              const type = DESTINATION_TYPES.find((value) => value === event.target.value);
              if (type) update({ type });
            }}
          >
            {DESTINATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`destinationTypes.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-status`} label={t("fields.status")}>
          <select
            id={`${id}-status`}
            value={current.status}
            onChange={(event) => {
              const status = CONTENT_STATUSES.find((value) => value === event.target.value);
              if (status) update({ status });
            }}
          >
            {CONTENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-days-min`} label={t("fields.recommendedDaysMin")}>
          <input
            id={`${id}-days-min`}
            type="number"
            min={1}
            value={current.daysMin}
            onChange={(event) => {
              update({ daysMin: event.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-days-max`} label={t("fields.recommendedDaysMax")}>
          <input
            id={`${id}-days-max`}
            type="number"
            min={1}
            value={current.daysMax}
            onChange={(event) => {
              update({ daysMax: event.target.value });
            }}
          />
        </Field>

        <fieldset>
          <legend>{t("fields.bestMonths")}</legend>
          <div className="months">
            {MONTHS.map((month) => (
              <label key={month} className="checkbox">
                <input
                  type="checkbox"
                  checked={current.bestMonths.includes(month)}
                  onChange={(event) => {
                    update({
                      bestMonths: event.target.checked
                        ? [...current.bestMonths, month]
                        : current.bestMonths.filter((value) => value !== month),
                    });
                  }}
                />
                {monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)))}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("fields.costs")}</legend>
          {current.costs.map((cost, index) => {
            const prefix = `${id}-cost-${String(index)}`;
            const setCost = (patch: Partial<CostDraft>) => {
              update({
                costs: current.costs.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
              });
            };
            return (
              <fieldset key={index}>
                <legend>{cost.currency}</legend>
                <Field id={`${prefix}-currency`} label={t("fields.costCurrency")}>
                  <select
                    id={`${prefix}-currency`}
                    value={cost.currency}
                    onChange={(event) => {
                      const currency = SUPPORTED_CURRENCIES.find((value) => value === event.target.value);
                      if (currency) setCost({ currency });
                    }}
                  >
                    {SUPPORTED_CURRENCIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${prefix}-period`} label={t("fields.costPeriod")}>
                  <select
                    id={`${prefix}-period`}
                    value={cost.period}
                    onChange={(event) => {
                      const period = COST_PERIODS.find((value) => value === event.target.value);
                      if (period) setCost({ period });
                    }}
                  >
                    {COST_PERIODS.map((value) => (
                      <option key={value} value={value}>
                        {t(`costPeriods.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${prefix}-scope`} label={t("fields.costScope")}>
                  <select
                    id={`${prefix}-scope`}
                    value={cost.scope}
                    onChange={(event) => {
                      const scope = COST_SCOPES.find((value) => value === event.target.value);
                      if (scope) setCost({ scope });
                    }}
                  >
                    {COST_SCOPES.map((value) => (
                      <option key={value} value={value}>
                        {t(`costScopes.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                {(
                  [
                    ["min", "costMin", "number"],
                    ["max", "costMax", "number"],
                    ["sourceName", "costSourceName", "text"],
                    ["sourceUrl", "costSourceUrl", "url"],
                    ["updatedAt", "costUpdatedAt", "date"],
                  ] as const
                ).map(([key, label, type]) => (
                  <Field key={key} id={`${prefix}-${key}`} label={t(`fields.${label}`)}>
                    <input
                      id={`${prefix}-${key}`}
                      type={type}
                      value={cost[key]}
                      onChange={(event) => {
                        setCost({ [key]: event.target.value });
                      }}
                    />
                  </Field>
                ))}
                {SUPPORTED_LOCALES.filter((locale) => current.translations[locale] !== undefined).map((locale) => (
                  <Field
                    key={locale}
                    id={`${prefix}-basis-${locale}`}
                    label={t("fields.costBasis", { language: t(`language.names.${locale}`) })}
                  >
                    <textarea
                      id={`${prefix}-basis-${locale}`}
                      lang={locale}
                      rows={3}
                      value={cost.basis[locale] ?? ""}
                      onChange={(event) => {
                        setCost({ basis: { ...cost.basis, [locale]: event.target.value } });
                      }}
                    />
                  </Field>
                ))}
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => {
                      update({ costs: current.costs.filter((_, itemIndex) => itemIndex !== index) });
                    }}
                  >
                    {t("common.remove")}
                  </button>
                </div>
              </fieldset>
            );
          })}
          <div className="actions">
            <button
              type="button"
              disabled={unusedCurrency === undefined}
              onClick={() => {
                if (unusedCurrency) update({ costs: [...current.costs, newCostDraft(unusedCurrency)] });
              }}
            >
              {t("fields.addCost")}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("fields.hasImage")}</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={current.hasImage}
              onChange={(event) => {
                update({ hasImage: event.target.checked });
              }}
            />
            {t("fields.hasImage")}
          </label>
          {current.hasImage && (
            <>
              <Field id={`${id}-image-url`} label={t("fields.imageUrl")}>
                <input
                  id={`${id}-image-url`}
                  type="url"
                  value={current.image.url}
                  onChange={(event) => {
                    update({ image: { ...current.image, url: event.target.value } });
                  }}
                />
              </Field>
              <Field id={`${id}-image-attribution`} label={t("fields.imageAttribution")}>
                <input
                  id={`${id}-image-attribution`}
                  value={current.image.attribution}
                  onChange={(event) => {
                    update({ image: { ...current.image, attribution: event.target.value } });
                  }}
                />
              </Field>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t("fields.translations")}</legend>
          <TranslationFieldset
            fields={fields}
            value={current.translations}
            onChange={(translations) => {
              update({ translations });
            }}
          />
        </fieldset>

        <fieldset>
          <legend>{t("fields.attributeScores")}</legend>
          {attributes.map((attribute) => (
            <Field
              key={attribute.id}
              id={`${id}-score-${String(attribute.id)}`}
              label={`${content.name(attribute.translations) ?? attribute.slug}${
                attribute.status === "archived" ? ` (${t("status.archived")})` : ""
              }`}
            >
              <input
                id={`${id}-score-${String(attribute.id)}`}
                type="number"
                min={0}
                max={5}
                value={current.scores[attribute.id] ?? ""}
                onChange={(event) => {
                  update({ scores: { ...current.scores, [attribute.id]: event.target.value } });
                }}
              />
            </Field>
          ))}
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </section>
  );
}
