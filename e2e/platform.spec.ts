import { expect, test } from "@playwright/test";
import { answerAllQuestions, axeViolations, mockAiOffered, startQuiz, watchPage } from "./fixtures";

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

test("serves the favicon and robots.txt as real files with the security headers", async ({ request }) => {
  for (const [file, type] of [
    ["/favicon.svg", "image/svg+xml"],
    ["/robots.txt", "text/plain"],
    ["/world-map.svg", "image/svg+xml"],
  ] as const) {
    const response = await request.get(file);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await response.text()).not.toContain('<div id="root">');
  }
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
  const results = page.getByRole("heading", { level: 1, name: "あなたへのおすすめ" });
  const question = page.getByRole("heading", { level: 1, name: /^質問 \d+ \/ \d+$/ });
  for (let step = 0; step < 20; step += 1) {
    // Wait for the next page so a question that is being replaced is never used.
    await expect(results.or(question)).toBeVisible();
    if (await results.isVisible()) break;
    const before = (await question.textContent()) ?? "";
    await page.getByRole("group").locator("input").first().focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "次へ" }).focus();
    await page.keyboard.press("Enter");
    await expect(results.or(question.filter({ hasNotText: before }))).toBeVisible();
  }
  await expect(results).toBeVisible();
});

test.describe("accessibility in a real browser (axe-core)", () => {
  // axe is injected as an inline script, which the strict CSP would block.
  test.use({ bypassCSP: true });

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

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the AI toggle and the daily-limit notice pass in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await mockAiOffered(page);
      await page.route("**/api/ai/explanations", (route) =>
        route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"rate_limited","limit":"daily","retryAfter":3600}' }),
      );
      await startQuiz(page);
      await page.getByLabel("AI アシストを使う").check();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "質問に進む" }).click();
      await answerAllQuestions(page);
      await expect(page.getByRole("status")).toContainText("本日分（UTC 基準）");
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
