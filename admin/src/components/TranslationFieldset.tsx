import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES } from "../../../shared/locales";
import { emptyEntry, type TranslationDraft, type TranslationFieldDef } from "./translationDraft";

interface Props<K extends string> {
  fields: readonly TranslationFieldDef<K>[];
  value: TranslationDraft<K>;
  onChange: (next: TranslationDraft<K>) => void;
}

/**
 * One fieldset per locale. Unchecking a locale removes its translation from
 * the payload; the server decides whether the remaining locales are enough.
 */
export function TranslationFieldset<K extends string>({ fields, value, onChange }: Props<K>) {
  const { t } = useTranslation();
  const baseId = useId();

  return (
    <div className="translations">
      {SUPPORTED_LOCALES.map((locale) => {
        const entry = value[locale];
        return (
          <fieldset key={locale} lang={locale}>
            <legend>{t(`language.names.${locale}`)}</legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={entry !== undefined}
                onChange={(event) => {
                  const next: TranslationDraft<K> = {};
                  for (const other of SUPPORTED_LOCALES) {
                    const existing = value[other];
                    if (other !== locale && existing) {
                      next[other] = existing;
                    }
                  }
                  if (event.target.checked) {
                    next[locale] = emptyEntry(fields);
                  }
                  onChange(next);
                }}
              />
              {t("common.enabled", { language: t(`language.names.${locale}`) })}
            </label>
            {entry !== undefined &&
              fields.map((field) => {
                const id = `${baseId}-${locale}-${field.key}`;
                const common = {
                  id,
                  value: entry[field.key],
                  onChange: (event: { target: { value: string } }) => {
                    onChange({ ...value, [locale]: { ...entry, [field.key]: event.target.value } });
                  },
                };
                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={id}>
                      {field.label}
                      {field.optional ? ` ${t("common.optional")}` : ""}
                    </label>
                    {field.multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
                  </div>
                );
              })}
          </fieldset>
        );
      })}
    </div>
  );
}
