import { localeLookupOrder, type Locale } from "../shared/locales";

/**
 * Picks the translation for `locale`, following the documented fallback chain
 * (docs/DECISIONS.md, ADR-012). Returns `undefined` when no translation in the
 * chain exists.
 */
export function pickTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  locale: Locale,
): T | undefined {
  for (const candidate of localeLookupOrder(locale)) {
    const match = translations.find((translation) => translation.locale === candidate);
    if (match) {
      return match;
    }
  }
  return undefined;
}
