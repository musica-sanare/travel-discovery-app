import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { intOrNull } from "../forms";
import { useLoad } from "../hooks";
import type { QuizSettings } from "../types";

const KEYS = ["minQuestions", "targetQuestions", "maxQuestions", "resultCount"] as const;
type Draft = Record<(typeof KEYS)[number], string>;

export function SettingsPage() {
  const { t } = useTranslation();
  const id = useId();
  const settings = useLoad(() => adminApi<{ quiz: QuizSettings }>("/settings"), "settings");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const loaded = settings.data?.quiz;
  const current: Draft | null =
    draft ??
    (loaded
      ? {
          minQuestions: String(loaded.minQuestions),
          targetQuestions: String(loaded.targetQuestions),
          maxQuestions: String(loaded.maxQuestions),
          resultCount: String(loaded.resultCount),
        }
      : null);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await adminApi("/settings", {
        method: "PUT",
        body: {
          quiz: {
            minQuestions: intOrNull(current.minQuestions),
            targetQuestions: intOrNull(current.targetQuestions),
            maxQuestions: intOrNull(current.maxQuestions),
            resultCount: intOrNull(current.resultCount),
          },
        },
      });
      setSaved(true);
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`}>{t("pages.settings")}</h1>
      {settings.loading && <p role="status">{t("common.loading")}</p>}
      <ErrorBanner error={settings.error} />
      {current && (
        <form className="editor" onSubmit={(event) => void submit(event)}>
          <ErrorBanner error={saveError} />
          {saved && <p role="status">{t("common.saved")}</p>}
          <fieldset>
            <legend>{t("settings.quiz")}</legend>
            {KEYS.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`${id}-${key}`}>{t(`settings.${key}`)}</label>
                <input
                  id={`${id}-${key}`}
                  type="number"
                  value={current[key]}
                  onChange={(event) => {
                    setSaved(false);
                    setDraft({ ...current, [key]: event.target.value });
                  }}
                />
              </div>
            ))}
          </fieldset>
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
