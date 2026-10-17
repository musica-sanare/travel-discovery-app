// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/createI18n";
import { RouteErrorPage } from "../pages/RouteErrorPage";
import { RootLayout } from "./RootLayout";
import { routes } from "./routes";

function renderAt(path: string) {
  const i18n = createI18n();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("RootLayout", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.lang = "";
  });

  it("renders Japanese by default and sets document language", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "あなたに合う海外の旅先を見つけよう",
    );
    expect(document.documentElement.lang).toBe("ja");
  });

  it.each([
    ["en", "Find an overseas destination that suits you"],
    ["es", "Encuentra un destino en el extranjero hecho para ti"],
  ])("switches the UI and document language to %s", async (locale, heading) => {
    renderAt("/");

    fireEvent.change(screen.getByLabelText("言語"), { target: { value: locale } });

    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(heading);
    expect(document.documentElement.lang).toBe(locale);
  });

  it("renders a localized not-found page for unknown routes", () => {
    renderAt("/does-not-exist");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ページが見つかりません");
  });

  it("renders a localized error page when a route throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(routes[0]?.ErrorBoundary).toBe(RouteErrorPage);
    const Thrower = () => {
      throw new Error("boom");
    };
    const router = createMemoryRouter([
      {
        path: "/",
        Component: RootLayout,
        ErrorBoundary: RouteErrorPage,
        children: [{ index: true, Component: Thrower }],
      },
    ]);

    render(
      <I18nextProvider i18n={createI18n()}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("問題が発生しました");
    expect(screen.queryByText("boom")).toBeNull();
  });
});
