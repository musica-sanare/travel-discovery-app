import { useId, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from "../i18n/locales";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const selectId = useId();
  const current = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isLocale(next)) {
      void i18n.changeLanguage(next);
    }
  };

  return (
    <div className="language-switcher">
      <label htmlFor={selectId}>{t("language.label")}</label>
      <select id={selectId} value={current} onChange={handleChange}>
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {t(`language.names.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
