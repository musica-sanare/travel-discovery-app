/** Shared helpers for E2E specs. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Request } from "@playwright/test";

const axeSource = readFileSync(path.join(import.meta.dirname, "../node_modules/axe-core/axe.min.js"), "utf8");

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

/** Same-origin requests other than the app shell, assets, the content snapshot, and the site AI status. */
export function unexpectedRequests(requests: readonly string[], baseURL: string): string[] {
  return requests.filter((url) => {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(baseURL).origin) return true;
    return !(
      parsed.pathname === "/" ||
      parsed.pathname === "/plan" ||
      parsed.pathname.startsWith("/assets/") ||
      parsed.pathname === "/favicon.svg" ||
      parsed.pathname === "/api/diagnosis-content" ||
      parsed.pathname === "/api/ai/status"
    );
  });
}

/**
 * Waits until running CSS animations (such as the 180 ms enter animation of
 * each question) have finished, so checks see the final rendering.
 */
export async function waitForAnimations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
}

/**
 * Runs axe-core on the current page after animations finish and returns one
 * line per violation. The calling test must use `bypassCSP: true`, because axe
 * is injected as an inline script.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  await waitForAnimations(page);
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  });
}

/** Makes the plan page see AI as offered, as on a deployment with AI enabled. */
export async function mockAiOffered(page: Page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({ contentType: "application/json", body: '{"enabled":true}' }));
}
