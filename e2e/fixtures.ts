/** Shared helpers for E2E specs. */
import { expect, type Page, type Request } from "@playwright/test";

/** Collects console errors, page errors, and every request URL made by the page. */
export function watchPage(page: Page) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request: Request) => requests.push(request.url()));
  return { errors, requests };
}

/** Answers every remaining question with its first option until the results page. */
export async function answerAllQuestions(page: Page): Promise<number> {
  let answered = 0;
  const results = page.getByRole("heading", { level: 1, name: /おすすめ|Recommended|Recomendados/ });
  const question = page.getByRole("heading", { level: 1, name: /^(質問 \d+ \/|Question \d+ of|Pregunta \d+ de)/ });
  while (answered < 20) {
    // Wait for the next page so the previous page's controls are never used.
    await expect(results.or(question)).toBeVisible();
    if (await results.isVisible()) {
      return answered;
    }
    const before = (await question.textContent()) ?? "";
    await page.getByRole("group").first().locator("input").first().check();
    await page.getByRole("button", { name: /^(次へ|Next|Siguiente)$/ }).click();
    answered += 1;
    await expect(results.or(question.filter({ hasNotText: before }))).toBeVisible();
  }
  throw new Error("quiz did not finish");
}

export async function startQuiz(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "診断をはじめる" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "旅の条件（任意）" })).toBeVisible();
}

/** Same-origin requests other than the app shell, assets, and the content snapshot. */
export function unexpectedRequests(requests: readonly string[], baseURL: string): string[] {
  return requests.filter((url) => {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(baseURL).origin) return true;
    return !(
      parsed.pathname === "/" ||
      parsed.pathname === "/plan" ||
      parsed.pathname.startsWith("/assets/") ||
      parsed.pathname === "/api/diagnosis-content"
    );
  });
}
