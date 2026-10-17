import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "../../../shared/locales";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { TranslationFieldset } from "../components/TranslationFieldset";
import { toTranslationDraft, type TranslationDraft } from "../components/translationDraft";
import { textOrNull } from "../forms";
import { useLoad } from "../hooks";
import { useContentText } from "../localizedContent";
import { TAXONOMY_STATUSES, type TaxonomyItem, type TaxonomyStatus } from "../types";

type Kind = "countries" | "attributes" | "categories";
type TextKey = "name" | "description";

interface Draft {
  id: number | null;
  slug: string;
  status: TaxonomyStatus;
  translations: TranslationDraft<TextKey>;
}

const EMPTY: Draft = { id: null, slug: "", status: "active", translations: { ja: { name: "", description: "" } } };

/** Shared list + form page for countries, attributes, and question categories. */
export function TaxonomyPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const content = useContentText();
  const formId = useId();
  const hasStatus = kind !== "countries";
  const hasDescription = kind === "attributes";
  const list = useLoad(() => adminApi<{ items: TaxonomyItem[] }>(`/${kind}`), kind);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const fields = [
    { key: "name" as const, label: t("fields.name") },
    ...(hasDescription
      ? [{ key: "description" as const, label: t("fields.description"), multiline: true, optional: true }]
      : []),
  ];

  const startEdit = (item: TaxonomyItem) => {
    setSaved(false);
    setSaveError(null);
    setDraft({
      id: item.id,
      slug: item.slug,
      status: item.status ?? "active",
      translations: toTranslationDraft(fields, item.translations),
    });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!draft) {
      return;
    }
    const translations: Partial<Record<Locale, { name: string; description?: string | null }>> = {};
    for (const [locale, entry] of Object.entries(draft.translations) as [Locale, Record<TextKey, string>][]) {
      translations[locale] = hasDescription
        ? { name: entry.name, description: textOrNull(entry.description) }
        : { name: entry.name };
    }
    const body = hasStatus
      ? { slug: draft.slug, status: draft.status, translations }
      : { slug: draft.slug, translations };

    setSaving(true);
    setSaveError(null);
    try {
      await adminApi(draft.id === null ? `/${kind}` : `/${kind}/${String(draft.id)}`, {
        method: draft.id === null ? "POST" : "PUT",
        body,
      });
      setDraft(null);
      setSaved(true);
      list.reload();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${formId}-heading`}>
      <h1 id={`${formId}-heading`}>{t(`pages.${kind}`)}</h1>
      {saved && <p role="status">{t("common.saved")}</p>}
      <p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setSaveError(null);
            setDraft(EMPTY);
          }}
        >
          {t("common.create")}
        </button>
      </p>

      {draft && (
        <form className="editor" onSubmit={(event) => void submit(event)} aria-describedby={`${formId}-errors`}>
          <div id={`${formId}-errors`}>
            <ErrorBanner error={saveError} />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-slug`}>{t("fields.slug")}</label>
            <input
              id={`${formId}-slug`}
              value={draft.slug}
              onChange={(event) => {
                setDraft({ ...draft, slug: event.target.value });
              }}
              required
            />
          </div>
          {hasStatus && (
            <div className="field">
              <label htmlFor={`${formId}-status`}>{t("fields.status")}</label>
              <select
                id={`${formId}-status`}
                value={draft.status}
                onChange={(event) => {
                  const next = TAXONOMY_STATUSES.find((status) => status === event.target.value);
                  if (next) {
                    setDraft({ ...draft, status: next });
                  }
                }}
              >
                {TAXONOMY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <TranslationFieldset
            fields={fields}
            value={draft.translations}
            onChange={(translations) => {
              setDraft({ ...draft, translations });
            }}
          />
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {list.loading && <p role="status">{t("common.loading")}</p>}
      <ErrorBanner error={list.error} />
      {list.data && list.data.items.length === 0 && <p>{t("common.empty")}</p>}
      {list.data && list.data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">{t("fields.slug")}</th>
              <th scope="col">{t("fields.name")}</th>
              {hasStatus && <th scope="col">{t("fields.status")}</th>}
              <th scope="col">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <code>{item.slug}</code>
                </td>
                <td>{content.name(item.translations) ?? item.slug}</td>
                {hasStatus && <td>{item.status ? t(`status.${item.status}`) : ""}</td>}
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      startEdit(item);
                    }}
                  >
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
