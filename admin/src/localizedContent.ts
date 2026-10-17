import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isLocale, localeLookupOrder, type Locale } from "../../shared/locales";

/**
 * Picks content text for the admin UI language, following the shared
 * fallback chain (ADR-012) before giving up.
 */
export function pickLocalized<T>(
  values: Partial<Record<Locale, T | undefined>>,
  uiLocale: string | undefined,
): T | undefined {
  const locale = isLocale(uiLocale) ? uiLocale : DEFAULT_LOCALE;
  for (const candidate of localeLookupOrder(locale)) {
    const value = values[candidate];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/** Content-text helpers bound to the current admin UI language. */
export function useContentText() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  return {
    text: (values: Partial<Record<Locale, string | undefined>>) => pickLocalized(values, locale),
    name: (translations: Partial<Record<Locale, { name: string } | undefined>>) =>
      pickLocalized(translations, locale)?.name,
  };
}
