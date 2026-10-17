import { describe, expect, it } from "vitest";
import { createI18n } from "./createI18n";

describe("createI18n", () => {
  it("defaults to Japanese", () => {
    expect(createI18n().resolvedLanguage).toBe("ja");
  });

  it.each([
    ["ja", ["ja", "en"]],
    ["en", ["en", "ja"]],
    ["es", ["es", "en", "ja"]],
  ] as const)("uses the documented fallback chain for %s", (locale, chain) => {
    expect(createI18n(locale).languages).toEqual(chain);
  });

  it("falls back to the default locale for unsupported languages", async () => {
    const i18n = createI18n();

    await i18n.changeLanguage("fr");

    expect(i18n.resolvedLanguage).toBe("ja");
  });
});
