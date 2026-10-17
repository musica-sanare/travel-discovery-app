export const SUPPORTED_LOCALES = ["ja", "en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

/**
 * Fallback order used when a translation is missing in the selected locale.
 * UI strings are required to be complete in every locale (enforced by the
 * type checker and tests); this chain matters mainly for admin-entered content.
 */
export const FALLBACK_LOCALES = {
  ja: ["en"],
  en: ["ja"],
  es: ["en", "ja"],
  default: [DEFAULT_LOCALE],
} as const satisfies Record<Locale | "default", readonly Locale[]>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
