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
import { answerAllQuestions, axeViolations, waitForAnimations } from "./fixtures";

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

    // It has only a Japanese translation: the Spanish public UI shows it in
    // Japanese, marked with lang="ja" and a visible hint (ADR-012).
    const publicPage = await page.context().newPage();
    await publicPage.goto(`${PUBLIC}/`);
    await publicPage.getByLabel("言語").selectOption("es");
    await publicPage.getByRole("link", { name: "Empezar el cuestionario" }).click();
    await publicPage.getByRole("button", { name: "Continuar a las preguntas" }).click();
    await answerAllQuestions(publicPage);
    const card = publicPage.getByRole("article").filter({ hasText: name });
    await expect(card).toBeVisible();
    const fallbackName = card.getByRole("heading", { level: 2 }).locator('[lang="ja"]').first();
    await expect(fallbackName).toContainText(name);
    await expect(fallbackName).toContainText("(mostrado en 日本語)");
    await publicPage.close();

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

test.describe("admin content import on the dev server", () => {
  test("checks a bundle, imports new items as drafts, and skips them on a rerun", async ({ page, request }) => {
    const suffix = String(Date.now());
    const country = `e2e-land-${suffix}`;
    const destination = `e2e-import-${suffix}`;
    const question = `e2e-import-q-${suffix}`;
    const bundle = (destinationCountry: string) =>
      JSON.stringify({
        format: "travel-discovery-content",
        version: 1,
        countries: [
          { slug: "portugal", translations: { ja: { name: "ポルトガル" } } },
          { slug: country, translations: { ja: { name: "E2E国" } } },
        ],
        destinations: [
          {
            slug: destination,
            country: destinationCountry,
            type: "city",
            status: "draft",
            recommendedDays: { min: null, max: null },
            image: null,
            attributeScores: [{ attribute: "food", score: 4 }],
            translations: { ja: { name: "E2E取り込み市", summary: "取り込みテスト用の架空の旅行先です。" } },
          },
        ],
        questions: [
          {
            slug: question,
            category: "travel-style",
            type: "single_choice",
            status: "draft",
            priorityWeight: 5,
            displayOrder: null,
            translations: { ja: { prompt: "E2E の質問ですか？" } },
            options: [
              { value: "yes", displayOrder: 0, translations: { ja: { label: "はい" } }, effects: [{ attribute: "nature", weight: 2 }] },
              { value: "no", displayOrder: 1, translations: { ja: { label: "いいえ" } }, effects: [] },
            ],
          },
        ],
      });

    await page.goto("/import");
    await expect(page.getByRole("heading", { level: 1, name: "コンテンツのインポート" })).toBeVisible();
    const input = page.getByLabel("JSON", { exact: true });
    const checkButton = page.getByRole("button", { name: "内容を確認" });

    await input.fill(bundle("no-such-country"));
    await checkButton.click();
    await expect(page.getByRole("alert")).toContainText("destinations[0].country");
    await expect(page.getByRole("alert")).toContainText("参照先のスラッグが見つかりません。");
    await expect(page.getByRole("button", { name: "取り込む" })).toHaveCount(0);

    await input.fill(bundle(country));
    await checkButton.click();
    await expect(page.getByRole("row", { name: /^国/ })).toContainText("portugal");
    await page.getByRole("button", { name: "取り込む" }).click();
    await expect(page.getByRole("status").filter({ hasText: "取り込みが完了しました。" })).toBeVisible();

    const destinations = (await (await request.get(`/api/admin/destinations?q=${destination}`)).json()) as {
      items: { slug: string; status: string }[];
    };
    expect(destinations.items).toEqual([expect.objectContaining({ slug: destination, status: "draft" })]);
    const questions = (await (await request.get(`/api/admin/questions?q=${question}`)).json()) as {
      items: { slug: string }[];
    };
    expect(questions.items.map((item) => item.slug)).toEqual([question]);
    expect((await request.get(`${PUBLIC}/api/destinations/${destination}?locale=ja`)).status()).toBe(404);

    await checkButton.click();
    await expect(page.getByRole("status").filter({ hasText: "新しく作成する項目はありません。" })).toBeVisible();
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

  for (const path of ["/destinations", "/destinations/new", "/questions", "/questions/new", "/countries", "/attributes", "/categories", "/settings", "/import"]) {
    test(`${path} has no violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "読み込み中…" })).toHaveCount(0);
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
