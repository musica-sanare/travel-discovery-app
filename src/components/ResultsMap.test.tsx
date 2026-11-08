// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import type { Locale } from "../../shared/locales";
import { createI18n } from "../i18n/createI18n";
import { ResultsMap, type MapResult } from "./ResultsMap";

const RESULTS: MapResult[] = [
  { rank: 1, name: "Taipei", countryName: "Taiwan", location: { latitude: 25.04, longitude: 121.56 } },
  { rank: 2, name: "South Iceland", countryName: "Iceland", location: null },
  { rank: 3, name: "Paris", countryName: null, location: { latitude: 48.86, longitude: 2.35 } },
];

async function renderMap(results: readonly MapResult[], locale: Locale = "en") {
  const i18n = createI18n();
  await i18n.changeLanguage(locale);
  return render(
    <I18nextProvider i18n={i18n}>
      <ResultsMap results={results} />
    </I18nextProvider>,
  );
}

describe("ResultsMap", () => {
  afterEach(cleanup);

  it("draws a numbered pin for each result with a location", async () => {
    const { container } = await renderMap(RESULTS);
    const pins = [...container.querySelectorAll("g[data-rank]")].map((pin) => pin.getAttribute("data-rank"));
    expect(pins).toEqual(["1", "3"]);
    expect([...container.querySelectorAll("text")].map((text) => text.textContent).sort()).toEqual(["1", "3"]);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the shown destinations and countries in its text alternative", async () => {
    await renderMap(RESULTS);
    expect(screen.getByRole("img", { name: "World map of your recommendations: No. 1 Taipei (Taiwan) and No. 3 Paris" })).toBeTruthy();
    expect(screen.getByText("Not on the map: No. 2 South Iceland (Iceland)")).toBeTruthy();
    expect(screen.getByRole("figure", { name: "On the map" })).toBeTruthy();
  });

  it.each([
    ["ja", "おすすめの行き先の世界地図。1位 Taipei（Taiwan）、3位 Paris"],
    ["es", "Mapa del mundo con tus recomendaciones: N.º 1 Taipei (Taiwan) y N.º 3 Paris"],
    ["fr", "Carte du monde de vos recommandations : N° 1 Taipei (Taiwan) et N° 3 Paris"],
  ] as const)("is localized in %s", async (locale, label) => {
    await renderMap(RESULTS, locale);
    expect(screen.getByRole("img", { name: label })).toBeTruthy();
  });

  it("renders nothing, without error, when no result has a location", async () => {
    const { container } = await renderMap(RESULTS.map((result) => ({ ...result, location: null })));
    expect(container.innerHTML).toBe("");
  });

  it("loads the land shape only through the map's own element", async () => {
    const { container } = await renderMap(RESULTS);
    expect(container.querySelectorAll(".world-map-land")).toHaveLength(1);
  });
});
