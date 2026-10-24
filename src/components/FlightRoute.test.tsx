// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { createI18n } from "../i18n/createI18n";
import { FlightRoute } from "./FlightRoute";

function renderRoute(percent: number) {
  const { container } = render(
    <I18nextProvider i18n={createI18n()}>
      <FlightRoute percent={percent} />
    </I18nextProvider>,
  );
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("FlightRoute rendered nothing");
  return root;
}

describe("FlightRoute", () => {
  afterEach(cleanup);

  it("is hidden from assistive technology", () => {
    expect(renderRoute(40).getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    [40, "40%"],
    [-5, "0%"],
    [130, "100%"],
  ])("places the plane and trail at %s → %s", (percent, expected) => {
    const root = renderRoute(percent);
    const plane = root.querySelector("svg");
    const trail = root.querySelector(".bg-sun");
    expect(plane?.style.left).toBe(expected);
    expect(trail instanceof HTMLElement ? trail.style.width : null).toBe(expected);
  });
});
