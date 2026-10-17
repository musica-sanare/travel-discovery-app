// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocale } from "../../shared/locales";
import { sharedContentCache } from "../diagnosis/contentClient";
import { testContent } from "../diagnosis/testContent";
import { createI18n } from "../i18n/createI18n";
import { routes } from "./routes";

let failRequests = false;
const requests: string[] = [];

beforeEach(() => {
  failRequests = false;
  requests.length = 0;
  sharedContentCache.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input, "https://app.example.test");
      requests.push(url.pathname + url.search);
      const locale = url.searchParams.get("locale");
      if (failRequests || !isLocale(locale)) {
        return Promise.resolve(new Response(JSON.stringify({ error: "service_unavailable" }), { status: 503 }));
      }
      return Promise.resolve(new Response(JSON.stringify(testContent(locale)), { status: 200 }));
    }),
  );
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    if (array instanceof Uint32Array) array[0] = 12345;
    return array;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <I18nextProvider i18n={createI18n()}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  return router;
}

async function startQuiz(options: { ai?: boolean; days?: string } = {}) {
  renderApp("/");
  fireEvent.click(screen.getByRole("link", { name: "診断をはじめる" }));
  await screen.findByRole("heading", { name: "旅の条件（任意）" });
  if (options.days) {
    fireEvent.change(screen.getByLabelText(/旅行日数/), { target: { value: options.days } });
  }
  if (options.ai) {
    fireEvent.click(screen.getByLabelText("AI アシストを使う"));
  }
  fireEvent.click(screen.getByRole("button", { name: "質問に進む" }));
  await screen.findByRole("heading", { name: /^質問 1 \/ 2$/ });
}

/** Radio buttons or checkboxes of the current question. */
function optionInputs(): HTMLInputElement[] {
  return [...screen.getByRole("group").querySelectorAll("input")];
}

function answerFirstOption() {
  const [first] = optionInputs();
  if (!first) throw new Error("no options");
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
}

describe("diagnosis flow", () => {
  it("runs landing → constraints → quiz → results without AI or answer uploads", async () => {
    await startQuiz({ days: "4" });
    answerFirstOption();
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    answerFirstOption();

    await screen.findByRole("heading", { name: "あなたへのおすすめ" });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByText(/^相対的な適合度: \d+ \/ 100$/)).toHaveLength(2);
    expect(screen.queryByText(/AI アシストは現在利用できません/)).toBeNull();
    // One snapshot request; answers and constraints never leave the browser.
    expect(requests).toEqual(["/api/diagnosis-content?locale=ja"]);
  });

  it("shows the AI-unavailable notice when the toggle is on, without any AI request", async () => {
    await startQuiz({ ai: true });
    answerFirstOption();
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    answerFirstOption();
    await screen.findByText(/AI アシストは現在利用できません/);
    expect(requests.every((url) => url.startsWith("/api/diagnosis-content?"))).toBe(true);
  });

  it("goes back with the previous answer prefilled, edits from results, and restarts", async () => {
    await startQuiz();
    answerFirstOption();
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    fireEvent.click(screen.getByRole("button", { name: "前の質問に戻る" }));
    await screen.findByRole("heading", { name: /^質問 1 \/ 2$/ });
    expect(optionInputs()[0]?.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    fireEvent.click(screen.getByRole("button", { name: "この質問をスキップ" }));
    await screen.findByRole("heading", { name: "あなたへのおすすめ" });
    expect(screen.getByText(/スキップ/)).toBeTruthy();

    const [editFirst] = screen.getAllByRole("button", { name: "回答を見直す" });
    if (!editFirst) throw new Error("no edit button");
    fireEvent.click(editFirst);
    await screen.findByRole("heading", { name: /^質問 1 \/ 2$/ });

    fireEvent.click(screen.getByRole("button", { name: "最初からやり直す" }));
    await screen.findByRole("heading", { name: /^質問 1 \/ 2$/ });
    expect(optionInputs().some((input) => input.checked)).toBe(false);
  });

  it("reloads content in the new language mid-quiz and keeps progress", async () => {
    await startQuiz();
    answerFirstOption();
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    fireEvent.change(screen.getByLabelText("言語"), { target: { value: "es" } });
    await screen.findByRole("heading", { name: /^Pregunta 2 de 2$/ });
    expect(requests).toEqual(["/api/diagnosis-content?locale=ja", "/api/diagnosis-content?locale=es"]);
  });

  it("shows a localized error with retry when the content cannot be loaded", async () => {
    failRequests = true;
    renderApp("/plan");
    fireEvent.click(await screen.findByRole("button", { name: "質問に進む" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("現在ご利用いただけません");
    failRequests = false;
    fireEvent.click(within(alert).getByRole("button", { name: "再読み込み" }));
    await screen.findByRole("heading", { name: /^質問 1 \/ 2$/ });
  });

  it("shows a validation error for invalid trip length", async () => {
    renderApp("/plan");
    fireEvent.change(await screen.findByLabelText(/旅行日数/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "質問に進む" }));
    expect(await screen.findByText("日数は 1〜365 の整数で入力してください。")).toBeTruthy();
    expect(requests).toEqual([]);
  });

  it.each(["/quiz", "/results"])("sends a direct visit to %s back to the constraints page", async (path) => {
    renderApp(path);
    await screen.findByRole("heading", { name: "旅の条件（任意）" });
    await waitFor(() => {
      expect(requests).toEqual([]);
    });
  });
});
