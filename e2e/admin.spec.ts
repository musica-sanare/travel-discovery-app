/**
 * Admin console end to end (docs/DECISIONS.md ADR-004, ADR-025).
 * - Denied paths run against the admin production build, which has no local
 *   identity and no Access JWT, so every admin API request must be 403.
 * - Allowed paths run against the admin dev server with the local E2E identity
 *   (`env.e2e` in wrangler.admin.jsonc), sharing the E2E database with the
 *   public server, so publication can be checked through the public API.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_PREVIEW_PORT } from "../playwright.config";
import { axeViolations, waitForAnimations } from "./fixtures";

const ADMIN_PREVIEW = `http://localhost:${String(ADMIN_PREVIEW_PORT)}`;
const PUBLIC = "http://localhost:4180";

test.describe("admin authorization on the production build", () => {
  test("rejects every kind of admin API request without an Access token", async ({ request }) => {
    for (const path of ["/api/admin/me", "/api/admin/destinations", "/api/admin/settings"]) {
      const response = await request.get(`${ADMIN_PREVIEW}${path}`);
      expect(response.status(), path).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
    }
    const write = await request.post(`${ADMIN_PREVIEW}/api/admin/countries`, {
      headers: { Origin: ADMIN_PREVIEW, "Content-Type": "application/json" },
      data: { slug: "e2e-denied", translations: { ja: { name: "拒否" } } },
    });
    expect(write.status()).toBe(403);
    const cookieOnly = await request.get(`${ADMIN_PREVIEW}/api/admin/me`, {
      headers: { Cookie: "CF_Authorization=not-a-valid-token" },
    });
    expect(cookieOnly.status()).toBe(403);
  });

  test("the admin UI shows the localized forbidden error and no data", async ({ page }) => {
    await page.goto(`${ADMIN_PREVIEW}/destinations`);
    await expect(page.getByText("権限がありません。再度ログインしてください。").first()).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test.describe("admin content workflow on the dev server", () => {
  test("draft → published → archived, and the public API follows the status", async ({ page, request }) => {
    const slug = `e2e-dest-${String(Date.now())}`;
    const name = "E2Eテスト港";
    const publicItem = () => request.get(`${PUBLIC}/api/destinations/${slug}?locale=ja`);

    await page.goto("/destinations");
    await expect(page.getByText("ログイン中: e2e-admin@example.test")).toBeVisible();
    await page.getByRole("link", { name: "新規作成" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "旅行先の新規作成" })).toBeVisible();

    await page.getByLabel(/^スラッグ/).fill(slug);
    await page.getByLabel("国", { exact: true }).selectOption({ label: "ポルトガル" });
    await page.getByLabel("名前", { exact: true }).fill(name);
    await page.getByLabel("概要", { exact: true }).fill("E2E テスト用の架空の旅行先です。");
    await expect(page.getByLabel("状態", { exact: true })).toHaveValue("draft");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存しました。" })).toBeVisible();
    await expect(page).toHaveURL(/\/destinations\/\d+$/);
    expect((await publicItem()).status()).toBe(404);

    await page.getByLabel("状態", { exact: true }).selectOption("published");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存しました。" })).toBeVisible();
    const published = await publicItem();
    expect(published.status()).toBe(200);
    expect(((await published.json()) as { item: { name: string } }).item.name).toBe(name);
    const snapshot = (await (await request.get(`${PUBLIC}/api/diagnosis-content?locale=ja`)).json()) as {
      destinations: { slug: string }[];
    };
    expect(snapshot.destinations.map((item) => item.slug)).toContain(slug);

    await page.getByLabel("状態", { exact: true }).selectOption("archived");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存しました。" })).toBeVisible();
    expect((await publicItem()).status()).toBe(404);

    await page.getByRole("link", { name: "一覧に戻る" }).click();
    await page.getByLabel("検索", { exact: true }).fill(slug);
    await page.getByRole("search").getByRole("button", { name: "検索" }).click();
    const row = page.getByRole("row").filter({ hasText: slug });
    await expect(row).toContainText("無効（アーカイブ）");
  });

  test("rejects invalid input with a localized field error and keeps the form", async ({ page }) => {
    await page.goto("/destinations/new");
    await page.getByLabel(/^スラッグ/).fill("Not A Slug");
    await page.getByLabel("国", { exact: true }).selectOption({ label: "ポルトガル" });
    await page.getByLabel("名前", { exact: true }).fill("無効な例");
    await page.getByLabel("概要", { exact: true }).fill("無効なスラッグの例です。");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("入力内容に問題があります。各項目を確認してください。")).toBeVisible();
    await expect(page).toHaveURL(/\/destinations\/new$/);
  });
});

test.describe("admin languages", () => {
  test("switching language updates the UI and document metadata and survives a reload", async ({ page }) => {
    await page.goto("/destinations");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page).toHaveTitle("Travel Discovery 管理画面");

    await page.getByLabel("言語").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Travel Discovery Admin");
    await expect(page.getByRole("navigation", { name: "Admin menu" }).getByRole("link", { name: "Destinations" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByLabel("Language").selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveTitle("Administración de Travel Discovery");
  });
});

test.describe("admin accessibility (axe-core)", () => {
  // axe is injected as an inline script, which a strict CSP would block.
  test.use({ bypassCSP: true });

  for (const path of ["/destinations", "/destinations/new", "/questions", "/questions/new", "/countries", "/attributes", "/categories", "/settings"]) {
    test(`${path} has no violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "読み込み中…" })).toHaveCount(0);
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
