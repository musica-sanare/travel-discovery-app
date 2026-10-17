import { useId, useState, type SyntheticEvent } from "react";
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
  QUESTION_TYPES,
  type ContentStatus,
  type QuestionDetail,
  type QuestionType,
  type TaxonomyItem,
} from "../types";

interface OptionDraft {
  /** Stable React key; not sent to the server. */
  key: string;
  value: string;
  displayOrder: string;
  translations: TranslationDraft<"label">;
  effects: Record<number, string>;
}

interface Draft {
  slug: string;
  categoryId: string;
  type: QuestionType;
  status: ContentStatus;
  priorityWeight: string;
  displayOrder: string;
  translations: TranslationDraft<"prompt" | "description">;
  options: OptionDraft[];
}

function newOption(displayOrder: number): OptionDraft {
  return {
    key: crypto.randomUUID(),
    value: "",
    displayOrder: String(displayOrder),
    translations: { ja: { label: "" } },
    effects: {},
  };
}

function newDraft(): Draft {
  return {
    slug: "",
    categoryId: "",
    type: "single_choice",
    status: "draft",
    priorityWeight: "5",
    displayOrder: "",
    translations: { ja: { prompt: "", description: "" } },
    options: [newOption(1), newOption(2)],
  };
}

const PROMPT_FIELDS = [
  { key: "prompt" as const, label: "prompt" },
  { key: "description" as const, label: "description" },
];
const LABEL_FIELDS = [{ key: "label" as const, label: "label" }];

function fromDetail(detail: QuestionDetail): Draft {
  return {
    slug: detail.slug,
    categoryId: String(detail.categoryId),
    type: detail.type,
    status: detail.status,
    priorityWeight: String(detail.priorityWeight),
    displayOrder: numberToText(detail.displayOrder),
    translations: toTranslationDraft(PROMPT_FIELDS, detail.translations),
    // Archived options are omitted; saving keeps them archived.
    options: detail.options
      .filter((option) => option.status !== "archived")
      .map((option) => ({
        key: `saved:${option.value}`,
        value: option.value,
        displayOrder: String(option.displayOrder),
        translations: toTranslationDraft(LABEL_FIELDS, option.translations),
        effects: Object.fromEntries(option.effects.map((effect) => [effect.attributeId, String(effect.weight)])),
      })),
  };
}

function pickTranslations<K extends string, R>(
  draft: TranslationDraft<K>,
  build: (entry: Record<K, string>) => R,
): Partial<Record<Locale, R>> {
  const result: Partial<Record<Locale, R>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const entry = draft[locale];
    if (entry) result[locale] = build(entry);
  }
  return result;
}

function toPayload(draft: Draft) {
  return {
    slug: draft.slug.trim(),
    categoryId: Number(draft.categoryId),
    type: draft.type,
    status: draft.status,
    priorityWeight: intOrNull(draft.priorityWeight),
    displayOrder: intOrNull(draft.displayOrder),
    translations: pickTranslations(draft.translations, (entry) => ({
      prompt: entry.prompt,
      description: textOrNull(entry.description),
    })),
    options: draft.options.map((option) => ({
      value: option.value.trim(),
      displayOrder: intOrNull(option.displayOrder) ?? 0,
      translations: pickTranslations(option.translations, (entry) => ({ label: entry.label })),
      effects: Object.entries(option.effects)
        .filter(([, weight]) => weight.trim() !== "")
        .map(([attributeId, weight]) => ({ attributeId: Number(attributeId), weight: intOrNull(weight) })),
    })),
  };
}

export function QuestionFormPage() {
  const { t } = useTranslation();
  const content = useContentText();
  const navigate = useNavigate();
  const editingId = useParams().id;
  const id = useId();

  const references = useLoad(
    async () => {
      const [categories, attributes, detail] = await Promise.all([
        adminApi<{ items: TaxonomyItem[] }>("/categories"),
        adminApi<{ items: TaxonomyItem[] }>("/attributes"),
        editingId ? adminApi<{ item: QuestionDetail }>(`/questions/${editingId}`) : null,
      ]);
      return { categories: categories.items, attributes: attributes.items, detail: detail?.item };
    },
    `question:${editingId ?? "new"}`,
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const current = draft ?? (references.data?.detail ? fromDetail(references.data.detail) : newDraft());
  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...current, ...patch });
  };
  const updateOption = (key: string, patch: Partial<OptionDraft>) => {
    update({ options: current.options.map((option) => (option.key === key ? { ...option, ...patch } : option)) });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const result = await adminApi<{ id: number }>(editingId ? `/questions/${editingId}` : "/questions", {
        method: editingId ? "PUT" : "POST",
        body: toPayload(current),
      });
      setSaved(true);
      if (!editingId) {
        void navigate(`/questions/${String(result.id)}`, { replace: true });
      }
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const title = editingId ? t("pages.editQuestion") : t("pages.newQuestion");
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
  const { categories, attributes } = references.data;
  const promptFields = [
    { key: "prompt" as const, label: t("fields.prompt"), multiline: true },
    { key: "description" as const, label: t("fields.description"), multiline: true, optional: true },
  ];
  const labelFields = [{ key: "label" as const, label: t("fields.optionLabel") }];

  return (
    <section aria-labelledby={`${id}-heading`}>
      <p>
        <Link to="/questions">{t("common.back")}</Link>
      </p>
      <h1 id={`${id}-heading`}>{title}</h1>
      <form className="editor" onSubmit={(event) => void submit(event)}>
        <ErrorBanner error={saveError} />
        {saved && <p role="status">{t("common.saved")}</p>}

        <div className="field">
          <label htmlFor={`${id}-slug`}>{t("fields.slug")}</label>
          <input
            id={`${id}-slug`}
            value={current.slug}
            required
            onChange={(event) => {
              update({ slug: event.target.value });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>{t("fields.category")}</label>
          <select
            id={`${id}-category`}
            value={current.categoryId}
            required
            onChange={(event) => {
              update({ categoryId: event.target.value });
            }}
          >
            <option value="">{t("common.noneSelected")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {content.name(category.translations) ?? category.slug}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>{t("fields.questionType")}</label>
          <select
            id={`${id}-type`}
            value={current.type}
            onChange={(event) => {
              const type = QUESTION_TYPES.find((value) => value === event.target.value);
              if (type) update({ type });
            }}
          >
            {QUESTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`questionTypes.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-status`}>{t("fields.status")}</label>
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
        </div>
        <div className="field">
          <label htmlFor={`${id}-priority`}>{t("fields.priorityWeight")}</label>
          <input
            id={`${id}-priority`}
            type="number"
            min={1}
            max={10}
            value={current.priorityWeight}
            onChange={(event) => {
              update({ priorityWeight: event.target.value });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-order`}>{`${t("fields.displayOrder")} ${t("common.optional")}`}</label>
          <input
            id={`${id}-order`}
            type="number"
            min={0}
            value={current.displayOrder}
            onChange={(event) => {
              update({ displayOrder: event.target.value });
            }}
          />
        </div>

        <fieldset>
          <legend>{t("fields.translations")}</legend>
          <TranslationFieldset
            fields={promptFields}
            value={current.translations}
            onChange={(translations) => {
              update({ translations });
            }}
          />
        </fieldset>

        <fieldset>
          <legend>{t("fields.options")}</legend>
          <p className="hint">{t("fields.removeOptionHint")}</p>
          {current.options.map((option, index) => (
            <fieldset key={option.key} className="option">
              <legend>{`${t("fields.options")} ${String(index + 1)}`}</legend>
              <div className="field">
                <label htmlFor={`${id}-option-${option.key}-value`}>{t("fields.optionValue")}</label>
                <input
                  id={`${id}-option-${option.key}-value`}
                  value={option.value}
                  required
                  onChange={(event) => {
                    updateOption(option.key, { value: event.target.value });
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-option-${option.key}-order`}>{t("fields.displayOrder")}</label>
                <input
                  id={`${id}-option-${option.key}-order`}
                  type="number"
                  min={0}
                  value={option.displayOrder}
                  onChange={(event) => {
                    updateOption(option.key, { displayOrder: event.target.value });
                  }}
                />
              </div>
              <TranslationFieldset
                fields={labelFields}
                value={option.translations}
                onChange={(translations) => {
                  updateOption(option.key, { translations });
                }}
              />
              <fieldset>
                <legend>{t("fields.effects")}</legend>
                {attributes.map((attribute) => {
                  const inputId = `${id}-option-${option.key}-effect-${String(attribute.id)}`;
                  return (
                    <div className="field" key={attribute.id}>
                      <label htmlFor={inputId}>{content.name(attribute.translations) ?? attribute.slug}</label>
                      <input
                        id={inputId}
                        type="number"
                        min={-5}
                        max={5}
                        value={option.effects[attribute.id] ?? ""}
                        onChange={(event) => {
                          updateOption(option.key, {
                            effects: { ...option.effects, [attribute.id]: event.target.value },
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </fieldset>
              <button
                type="button"
                onClick={() => {
                  update({ options: current.options.filter((item) => item.key !== option.key) });
                }}
              >
                {t("common.remove")}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => {
              update({ options: [...current.options, newOption(current.options.length + 1)] });
            }}
          >
            {t("fields.addOption")}
          </button>
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
