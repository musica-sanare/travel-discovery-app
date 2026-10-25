/**
 * Initial UI locale and its persistence (docs/working/DECISIONS.md ADR-022): a stored
 * supported choice, else the first supported browser language, else Japanese.
 * Only this preference is stored; storage failures are ignored.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../shared/locales";

export const LOCALE_STORAGE_KEY = "travel-discovery.locale";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readStoredLocale(storage: PreferenceStorage | undefined = browserStorage()): Locale | undefined {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function storeLocale(locale: Locale, storage: PreferenceStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode, disabled storage); the choice then lasts for this page only.
  }
}

/** Matches BCP 47 tags by primary language, e.g. `es-MX` → `es`. */
export function detectBrowserLocale(languages: readonly string[]): Locale | undefined {
  for (const tag of languages) {
    const primary = tag.split("-")[0]?.toLowerCase();
    if (isLocale(primary)) {
      return primary;
    }
  }
  return undefined;
}

export function resolveInitialLocale(
  storage: PreferenceStorage | undefined = browserStorage(),
  languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
): Locale {
  return readStoredLocale(storage) ?? detectBrowserLocale(languages) ?? DEFAULT_LOCALE;
}
