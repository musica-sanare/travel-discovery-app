// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    ["fr", "Trouvez une destination à l’étranger faite pour vous"],
  ])("switches the UI and document language to %s", async (locale, heading) => {
    renderAt("/");

    fireEvent.change(screen.getByLabelText("言語"), { target: { value: locale } });

    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(heading);
    expect(document.documentElement.lang).toBe(locale);
  });

  it("shows the hero call to action and the three-step departure board", () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "診断をはじめる" }).getAttribute("href")).toBe("/plan");
    const board = screen.getByRole("region", { name: "出発までの流れ" });
    const steps = board.querySelectorAll("ol > li");
    expect(steps).toHaveLength(3);
    expect(steps[0]?.textContent).toContain("旅の条件を入力（任意）");
    // Decorative ticket captions are not exposed to assistive technology.
    expect(screen.getByText("CHECK-IN").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the privacy and indicative-cost notes in the footer", () => {
    renderAt("/");

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("回答はこのブラウザの中だけで使われ");
    expect(footer.textContent).toContain("現在の価格ではありません");
    // An ordinary same-tab link to the hub page; it carries no user data.
    const hub = within(footer).getByRole("link", { name: "musica-sanare.com のほかのページ" });
    expect(hub.getAttribute("href")).toBe("https://musica-sanare.com/");
    expect(hub.getAttribute("target")).toBeNull();
  });

  it("keeps the description in sync with the locale", async () => {
    const meta = document.createElement("meta");
    meta.name = "description";
    document.head.append(meta);
    try {
      renderAt("/");
      expect(meta.content).toContain("あなたの旅のスタイルに合う");
      fireEvent.change(screen.getByLabelText("言語"), { target: { value: "en" } });
      await screen.findByRole("heading", { level: 1, name: "Find an overseas destination that suits you" });
      expect(meta.content).toContain("suit how you like to travel");
    } finally {
      meta.remove();
    }
  });

  it("renders a localized not-found page for unknown routes", () => {
    renderAt("/does-not-exist");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ページが見つかりません");
    expect(screen.getByRole("link", { name: "トップページに戻る" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("404 · GATE NOT FOUND").getAttribute("aria-hidden")).toBe("true");
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
