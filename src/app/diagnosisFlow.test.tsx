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
const aiBodies: unknown[] = [];
const AI_TEXT = "ゆったりとした街歩きと豊かな食文化があり、あなたの好みに合いそうです。";
/** Response of the mocked AI endpoint: echoes one text per expected slug by default. */
let aiResponse: (body: { expected: string[] }) => Response;

function echoAi(body: { expected: string[] }) {
  return new Response(JSON.stringify({ explanations: body.expected.map((slug) => ({ slug, text: `${AI_TEXT}（${slug}）` })) }));
}

beforeEach(() => {
  failRequests = false;
  requests.length = 0;
  aiBodies.length = 0;
  aiResponse = echoAi;
  sharedContentCache.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, "https://app.example.test");
      requests.push(url.pathname + url.search);
      if (url.pathname === "/api/ai/explanations") {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as { expected: string[] };
        aiBodies.push(body);
        return Promise.resolve(aiResponse(body));
      }
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

    // Outbound search links are fixed start pages that carry no user data (ADR-024).
    const flights = screen.getAllByRole("link", { name: /Google Flightsで航空券を探す.*新しいタブで開きます/ });
    const hotels = screen.getAllByRole("link", { name: /Booking\.comでホテルを探す.*新しいタブで開きます/ });
    expect(flights).toHaveLength(2);
    for (const link of [...flights, ...hotels]) {
      expect(["https://www.google.com/travel/flights", "https://www.booking.com/"]).toContain(link.getAttribute("href"));
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  async function finishQuizWithAi(options: { days?: string } = {}) {
    await startQuiz({ ai: true, ...options });
    answerFirstOption();
    await screen.findByRole("heading", { name: /^質問 2 \/ 2$/ });
    answerFirstOption();
    await screen.findByRole("heading", { name: "あなたへのおすすめ" });
  }

  it("with AI on, sends one request with IDs only and adds labelled AI notes next to the deterministic explanation", async () => {
    await finishQuizWithAi({ days: "4" });
    await screen.findByText("各旅行先に AI による補足を追加しました。");
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      const note = within(article).getByRole("heading", { level: 3, name: "AI による補足" }).parentElement;
      expect(note?.textContent).toContain(AI_TEXT);
      expect(note?.textContent).toContain("AI が生成した文章です。");
      // The deterministic explanation stays visible.
      expect(within(article).getByText(/^相対的な適合度: \d+ \/ 100$/)).toBeTruthy();
    }
    expect(requests.filter((url) => url === "/api/ai/explanations")).toHaveLength(1);
    const [body] = aiBodies as { locale: string; answers: unknown[]; constraints: unknown; expected: string[] }[];
    expect(Object.keys(body ?? {}).sort()).toEqual(["answers", "constraints", "expected", "locale"]);
    expect(body?.locale).toBe("ja");
    expect(body?.constraints).toEqual({ days: 4 });
    expect(body?.answers).toHaveLength(2);
    // Order of cards follows the deterministic ranking, not the AI response.
    expect(articles.map((article) => article.getAttribute("aria-labelledby"))).toEqual(
      body?.expected.map((slug) => `result-${slug}`),
    );
  });

  it("keeps the ranking when the AI response lists destinations in another order", async () => {
    aiResponse = (body) =>
      new Response(JSON.stringify({ explanations: [...body.expected].reverse().map((slug) => ({ slug, text: AI_TEXT })) }));
    await finishQuizWithAi();
    await screen.findByText("各旅行先に AI による補足を追加しました。");
    const [body] = aiBodies as { expected: string[] }[];
    expect(screen.getAllByRole("article").map((article) => article.getAttribute("aria-labelledby"))).toEqual(
      body?.expected.map((slug) => `result-${slug}`),
    );
  });

  it.each([
    [409, "診断中に登録データが更新されたため"],
    [429, "AI アシストへのリクエストが集中しています"],
    [503, "AI アシストは現在利用できません"],
    [500, "AI アシストは現在利用できません"],
  ])("shows a non-blocking notice and the normal results for status %i", async (status, notice) => {
    aiResponse = () => new Response(JSON.stringify({ error: "x" }), { status });
    await finishQuizWithAi();
    expect((await screen.findByRole("status")).textContent).toContain(notice);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "AI による補足" })).toBeNull();
    expect(requests.filter((url) => url === "/api/ai/explanations")).toHaveLength(1);
  });

  it("shows the unavailable notice when the AI request fails at the network level", async () => {
    aiResponse = () => {
      throw new TypeError("Failed to fetch");
    };
    await finishQuizWithAi();
    expect((await screen.findByRole("status")).textContent).toContain("AI アシストは現在利用できません");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("requests AI notes again in the new language and shows them in that language", async () => {
    await finishQuizWithAi();
    await screen.findByText("各旅行先に AI による補足を追加しました。");
    fireEvent.change(screen.getByLabelText("言語"), { target: { value: "en" } });
    await screen.findByText("AI notes have been added to each destination.");
    expect((aiBodies as { locale: string }[]).map((body) => body.locale)).toEqual(["ja", "en"]);
    expect(screen.getAllByRole("heading", { level: 3, name: "AI-generated note" })).toHaveLength(2);

    // Switching back reuses the remembered result instead of sending another request.
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ja" } });
    await screen.findByText("各旅行先に AI による補足を追加しました。");
    expect((aiBodies as { locale: string }[]).map((body) => body.locale)).toEqual(["ja", "en"]);
  });

  it("does not retry a failed AI request when the results are shown again in the same language", async () => {
    aiResponse = () => new Response(JSON.stringify({ error: "x" }), { status: 503 });
    await finishQuizWithAi();
    await screen.findByText(/AI アシストは現在利用できません/);
    fireEvent.change(screen.getByLabelText("言語"), { target: { value: "en" } });
    await screen.findByText(/AI assistance is not available right now/);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ja" } });
    await screen.findByText(/AI アシストは現在利用できません/);
    expect((aiBodies as { locale: string }[]).map((body) => body.locale)).toEqual(["ja", "en"]);
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
