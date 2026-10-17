// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import type { Locale } from "../../shared/locales";
import { createAdminI18n } from "./i18n/createAdminI18n";
import { pickLocalized, useContentText } from "./localizedContent";

describe("pickLocalized", () => {
  const all = { ja: "リスボン", en: "Lisbon", es: "Lisboa" };

  it.each([
    ["ja", "リスボン"],
    ["en", "Lisbon"],
    ["es", "Lisboa"],
  ])("returns the %s value when present", (locale, expected) => {
    expect(pickLocalized(all, locale)).toBe(expected);
  });

  it("falls back to en, not straight to nothing, when ja is missing", () => {
    expect(pickLocalized({ en: "Lisbon", es: "Lisboa" }, "ja")).toBe("Lisbon");
  });

  it("follows es → en → ja", () => {
    expect(pickLocalized({ ja: "リスボン", en: "Lisbon" }, "es")).toBe("Lisbon");
    expect(pickLocalized({ ja: "リスボン" }, "es")).toBe("リスボン");
  });

  it("follows en → ja", () => {
    expect(pickLocalized({ ja: "リスボン", es: "Lisboa" }, "en")).toBe("リスボン");
  });

  it("uses the default locale chain for unknown UI languages", () => {
    expect(pickLocalized({ en: "Lisbon" }, "fr")).toBe("Lisbon");
    expect(pickLocalized({ en: "Lisbon" }, undefined)).toBe("Lisbon");
  });

  it("returns undefined only when no locale in the chain exists", () => {
    // ADR-012: the ja chain is ja → en, so es-only content has no ja fallback.
    expect(pickLocalized({ es: "Lisboa" }, "ja")).toBeUndefined();
  });
});

function Probe({ names }: { names: Partial<Record<Locale, { name: string }>> }) {
  const content = useContentText();
  return <p>{content.name(names) ?? "slug"}</p>;
}

describe("useContentText", () => {
  afterEach(cleanup);

  it.each([
    ["ja", "ポルトガル"],
    ["en", "Portugal"],
    ["es", "Portugal (es)"],
  ] as const)("follows the admin UI language (%s)", (locale, expected) => {
    render(
      <I18nextProvider i18n={createAdminI18n(locale)}>
        <Probe names={{ ja: { name: "ポルトガル" }, en: { name: "Portugal" }, es: { name: "Portugal (es)" } }} />
      </I18nextProvider>,
    );
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("falls back to en when the UI is Japanese and only en/es exist", () => {
    render(
      <I18nextProvider i18n={createAdminI18n("ja")}>
        <Probe names={{ en: { name: "Portugal" }, es: { name: "Portugal (es)" } }} />
      </I18nextProvider>,
    );
    expect(screen.getByText("Portugal")).toBeTruthy();
  });
});
