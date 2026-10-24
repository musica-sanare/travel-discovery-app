import { useId, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from "../../shared/locales";
import { storeLocale } from "../i18n/localePreference";
import { GlobeIcon } from "./Decorations";

/** Language picker for the navy header band. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const selectId = useId();
  const current = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isLocale(next)) {
      storeLocale(next);
      void i18n.changeLanguage(next);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <GlobeIcon className="size-5 text-sky-muted" />
      <label htmlFor={selectId} className="sr-only sm:not-sr-only sm:text-sky-muted">
        {t("language.label")}
      </label>
      <select
        id={selectId}
        value={current}
        onChange={handleChange}
        className="min-h-11 rounded-full border border-sky-muted/60 bg-sky px-3 py-1 text-sky-ink hover:border-sun [&>option]:bg-surface [&>option]:text-ink"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {t(`language.names.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
