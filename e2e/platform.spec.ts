import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { answerAllQuestions, startQuiz, watchPage } from "./fixtures";

const axeSource = readFileSync(path.join(import.meta.dirname, "../node_modules/axe-core/axe.min.js"), "utf8");

test("serves the security headers and renders without CSP errors", async ({ page }) => {
  const { errors } = watchPage(page);
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await startQuiz(page);
  await page.getByRole("button", { name: "質問に進む" }).click();
  await answerAllQuestions(page);
  // Progress and fit bars set widths through the CSSOM, which CSP allows.
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("has no horizontal overflow", async ({ page }) => {
  for (const url of ["/", "/plan"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "質問に進む" }).click();
  await answerAllQuestions(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("completes the quiz with the keyboard only", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow is checked on desktop");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "本文へ移動" })).toBeFocused();
  await page.getByRole("link", { name: "診断をはじめる" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "質問に進む" }).focus();
  await page.keyboard.press("Enter");
  for (let step = 0; step < 20; step += 1) {
    if (await page.getByRole("heading", { level: 1, name: "あなたへのおすすめ" }).isVisible()) break;
    await page.getByRole("group").locator("input").first().focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "次へ" }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { level: 1, name: "あなたへのおすすめ" })).toBeVisible();
});

test.describe("accessibility in a real browser (axe-core)", () => {
  // axe is injected as an inline script, which the strict CSP would block.
  test.use({ bypassCSP: true });

  async function axeViolations(page: Page): Promise<string[]> {
    await page.addScriptTag({ content: axeSource });
    return page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const result = await axe.run(document);
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`all pages pass in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("link", { name: "診断をはじめる" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "旅の条件（任意）" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "質問に進む" }).click();
      await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await answerAllQuestions(page);
      for (const summary of await page.locator("details > summary").all()) await summary.click();
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
