import { SUPPORTED_LOCALES, type Locale } from "../../../shared/locales";

export interface TranslationFieldDef<K extends string> {
  key: K;
  label: string;
  multiline?: boolean;
  optional?: boolean;
}

export type TranslationDraft<K extends string> = Partial<Record<Locale, Record<K, string>>>;

/** A blank entry for every field; the cast is needed to build a generic record. */
export function emptyEntry<K extends string>(fields: readonly TranslationFieldDef<K>[]): Record<K, string> {
  const entry: Partial<Record<K, string>> = {};
  for (const field of fields) {
    entry[field.key] = "";
  }
  return entry as Record<K, string>;
}

/** Builds a draft from API translations, mapping null to "". */
export function toTranslationDraft<K extends string>(
  fields: readonly TranslationFieldDef<K>[],
  translations: Partial<Record<Locale, Partial<Record<K, string | string[] | null>>>>,
): TranslationDraft<K> {
  const draft: TranslationDraft<K> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const source = translations[locale];
    if (!source) {
      continue;
    }
    const entry = emptyEntry(fields);
    for (const field of fields) {
      const raw: string | string[] | null | undefined = source[field.key];
      entry[field.key] = Array.isArray(raw) ? raw.join("\n") : (raw ?? "");
    }
    draft[locale] = entry;
  }
  return draft;
}
