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
import {
  CONTENT_STATUSES,
  COST_SCOPES,
  DESTINATION_TYPES,
  type ContentStatus,
  type CostScope,
  type DestinationDetail,
  type DestinationType,
  type TaxonomyItem,
} from "../types";

type TextKey = "name" | "summary" | "highlights" | "cautions" | "bestSeason" | "costBasis" | "imageAlt";

interface Draft {
  slug: string;
  countryId: string;
  type: DestinationType;
  status: ContentStatus;
  daysMin: string;
  daysMax: string;
  hasCost: boolean;
  cost: {
    min: string;
    max: string;
    currency: string;
    scope: CostScope;
    sourceName: string;
    sourceUrl: string;
    updatedAt: string;
  };
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
    hasCost: false,
    cost: {
      min: "",
      max: "",
      currency: "JPY",
      scope: "per_person_excluding_international_flights",
      sourceName: "",
      sourceUrl: "",
      updatedAt: "",
    },
    hasImage: false,
    image: { url: "", attribution: "" },
    translations: {
      ja: { name: "", summary: "", highlights: "", cautions: "", bestSeason: "", costBasis: "", imageAlt: "" },
    },
    scores: {},
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
    hasCost: detail.cost !== null,
    cost: detail.cost
      ? {
          min: String(detail.cost.min),
          max: String(detail.cost.max),
          currency: detail.cost.currency,
          scope: detail.cost.scope,
          sourceName: detail.cost.sourceName,
          sourceUrl: detail.cost.sourceUrl ?? "",
          updatedAt: detail.cost.updatedAt,
        }
      : base.cost,
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
      costBasis: textOrNull(entry.costBasis),
      imageAlt: textOrNull(entry.imageAlt),
    };
  }
  return {
    slug: draft.slug.trim(),
    countryId: Number(draft.countryId),
    type: draft.type,
    status: draft.status,
    recommendedDays: { min: intOrNull(draft.daysMin), max: intOrNull(draft.daysMax) },
    cost: draft.hasCost
      ? {
          min: intOrNull(draft.cost.min),
          max: intOrNull(draft.cost.max),
          currency: draft.cost.currency.trim().toUpperCase(),
          scope: draft.cost.scope,
          sourceName: draft.cost.sourceName,
          sourceUrl: textOrNull(draft.cost.sourceUrl),
          updatedAt: draft.cost.updatedAt,
        }
      : null,
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
  const { t } = useTranslation();
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
    { key: "costBasis", label: t("fields.costBasis"), multiline: true, optional: true },
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
          <legend>{t("fields.hasCost")}</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={current.hasCost}
              onChange={(event) => {
                update({ hasCost: event.target.checked });
              }}
            />
            {t("fields.hasCost")}
          </label>
          {current.hasCost && (
            <>
              {(
                [
                  ["min", "costMin", "number"],
                  ["max", "costMax", "number"],
                  ["currency", "costCurrency", "text"],
                  ["sourceName", "costSourceName", "text"],
                  ["sourceUrl", "costSourceUrl", "url"],
                  ["updatedAt", "costUpdatedAt", "date"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} id={`${id}-cost-${key}`} label={t(`fields.${label}`)}>
                  <input
                    id={`${id}-cost-${key}`}
                    type={type}
                    value={current.cost[key]}
                    onChange={(event) => {
                      update({ cost: { ...current.cost, [key]: event.target.value } });
                    }}
                  />
                </Field>
              ))}
              <Field id={`${id}-cost-scope`} label={t("fields.costScope")}>
                <select
                  id={`${id}-cost-scope`}
                  value={current.cost.scope}
                  onChange={(event) => {
                    const scope = COST_SCOPES.find((value) => value === event.target.value);
                    if (scope) update({ cost: { ...current.cost, scope } });
                  }}
                >
                  {COST_SCOPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`costScopes.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
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
