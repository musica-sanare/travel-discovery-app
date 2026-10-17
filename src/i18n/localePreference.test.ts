import { describe, expect, it } from "vitest";
import {
  detectBrowserLocale,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  resolveInitialLocale,
  storeLocale,
} from "./localePreference";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
};

describe("locale preference", () => {
  it("prefers a stored supported locale over the browser language", () => {
    expect(resolveInitialLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: "es" }), ["en-US"])).toBe("es");
  });

  it("ignores unsupported or malformed stored values", () => {
    expect(readStoredLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: "fr" }))).toBeUndefined();
    expect(resolveInitialLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: "<script>" }), ["en-GB"])).toBe("en");
  });

  it("uses the first supported browser language by primary subtag", () => {
    expect(detectBrowserLocale(["fr-FR", "es-MX", "en"])).toBe("es");
    expect(detectBrowserLocale(["JA-jp"])).toBe("ja");
    expect(detectBrowserLocale(["zh-Hant", "de"])).toBeUndefined();
  });

  it("defaults to Japanese", () => {
    expect(resolveInitialLocale(memoryStorage(), ["fr", "de"])).toBe("ja");
    expect(resolveInitialLocale(undefined, [])).toBe("ja");
  });

  it("stores the choice and survives unavailable storage", () => {
    const storage = memoryStorage();
    storeLocale("en", storage);
    expect(storage.values.get(LOCALE_STORAGE_KEY)).toBe("en");
    expect(() => {
      storeLocale("en", throwingStorage);
    }).not.toThrow();
    expect(resolveInitialLocale(throwingStorage, ["es"])).toBe("es");
  });
});
