/**
 * Admin console end to end (docs/working/DECISIONS.md ADR-004, ADR-025).
 * - Denied paths run against the admin production build, which has no local
 *   identity and no Access JWT, so every admin API request must be 403.
 * - Allowed paths run against the admin dev server with the local E2E identity
 *   (`env.e2e` in wrangler.admin.jsonc), sharing the E2E database with the
 *   public server, so publication can be checked through the public API.
 */
import { expect, test, type APIRequestContext, type APIResponse, type Page, type Request } from "@playwright/test";
import { ADMIN_PREVIEW_PORT } from "../playwright.config";
import { answerAllQuestions, axeViolations, waitForAnimations } from "./fixtures";

const ADMIN_PREVIEW = `http://localhost:${String(ADMIN_PREVIEW_PORT)}`;
const PUBLIC = "http://localhost:4180";

/**
 * The admin dev server and the public server are separate workerd processes
 * sharing one local SQLite file, and workerd does not wait for another
 * process's lock: two overlapping requests fail with SQLITE_BUSY (503 in either
 * server; seen in CI on 2026-10-24). Deployed D1 has no shared local file.
 * `settled()` resolves once the admin page has had no API request in flight for
 * 300 ms, so a following public request never overlaps an admin one. Nothing is
 * retried and expected statuses are unchanged.
 */
function trackAdminRequests(page: Page): () => Promise<void> {
  const pending = new Set<Request>();
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) pending.add(request);
  });
  const done = (request: Request) => pending.delete(request);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return async () => {
    for (let quiet = 0; quiet < 3; ) {
      await page.waitForTimeout(100);
      quiet = pending.size === 0 ? quiet + 1 : 0;
    }
  };
}

async function publicGet(
  settled: () => Promise<void>,
  request: APIRequestContext,
  path: string,
  status: number,
): Promise<APIResponse> {
  await settled();
  const response = await request.get(`${PUBLIC}${path}`);
  expect(response.status(), `GET ${path}`).toBe(status);
  return response;
}

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
    const settled = trackAdminRequests(page);
    const publicItem = (status: number) => publicGet(settled, request, `/api/destinations/${slug}?locale=ja`, status);

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
    await publicItem(404);

    await page.getByLabel("状態", { exact: true }).selectOption("published");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存しました。" })).toBeVisible();
    const published = await publicItem(200);
    expect(((await published.json()) as { item: { name: string } }).item.name).toBe(name);
    const snapshot = (await (await publicGet(settled, request, "/api/diagnosis-content?locale=ja", 200)).json()) as {
      destinations: { slug: string }[];
    };
    expect(snapshot.destinations.map((item) => item.slug)).toContain(slug);

    // It has only a Japanese translation: the Spanish public UI shows it in
    // Japanese, marked with lang="ja" and a visible hint (ADR-012).
    await settled();
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
    await publicItem(404);

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
  test("checks a bundle, imports new items as drafts, skips them on a rerun, and updates them on request", async ({ page, request }) => {
    const settled = trackAdminRequests(page);
    const suffix = String(Date.now());
    const country = `e2e-land-${suffix}`;
    const destination = `e2e-import-${suffix}`;
    const question = `e2e-import-q-${suffix}`;
    // Portugal comes from the seed; it is listed only outside update mode, which would replace it.
    const bundle = ({
      destinationCountry = country,
      bestMonths = [] as number[],
      withPortugal = true,
      countryName = "E2E国",
      yesLabel = "はい",
      withNo = true,
    } = {}) =>
      JSON.stringify({
        format: "travel-discovery-content",
        version: 1,
        countries: [
          ...(withPortugal ? [{ slug: "portugal", translations: { ja: { name: "ポルトガル" } } }] : []),
          { slug: country, translations: { ja: { name: countryName } } },
        ],
        destinations: [
          {
            slug: destination,
            country: destinationCountry,
            type: "city",
            status: "draft",
            recommendedDays: { min: null, max: null },
            bestMonths,
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
              { value: "yes", displayOrder: 0, translations: { ja: { label: yesLabel } }, effects: [{ attribute: "nature", weight: 2 }] },
              ...(withNo ? [{ value: "no", displayOrder: 1, translations: { ja: { label: "いいえ" } }, effects: [] }] : []),
            ],
          },
        ],
      });

    await page.goto("/import");
    await expect(page.getByRole("heading", { level: 1, name: "コンテンツのインポート" })).toBeVisible();
    const input = page.getByLabel("JSON", { exact: true });
    const checkButton = page.getByRole("button", { name: "内容を確認" });

    await input.fill(bundle({ destinationCountry: "no-such-country" }));
    await checkButton.click();
    await expect(page.getByRole("alert")).toContainText("destinations[0].country");
    await expect(page.getByRole("alert")).toContainText("参照先のスラッグが見つかりません。");
    await expect(page.getByRole("button", { name: "取り込む" })).toHaveCount(0);

    await input.fill(bundle());
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
    await publicGet(settled, request, `/api/destinations/${destination}?locale=ja`, 404);

    await checkButton.click();
    await expect(page.getByRole("status").filter({ hasText: "作成または更新する項目はありません。" })).toBeVisible();

    // Update mode: only the changed destination is replaced, after a field-level diff.
    await input.fill(bundle({ bestMonths: [5, 4], withPortugal: false }));
    await checkButton.click();
    await expect(page.getByRole("status").filter({ hasText: "作成または更新する項目はありません。" })).toBeVisible();
    await page.getByLabel(/既存の項目を更新する/).check();
    await checkButton.click();
    await expect(page.getByRole("row", { name: /^旅行先/ })).toContainText(destination);
    await page.getByText(`旅行先: ${destination} の変更点（1 件）`).click();
    await expect(page.getByRole("row", { name: /bestMonths/ })).toContainText("[4,5]");
    await waitForAnimations(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.getByRole("button", { name: "取り込む" }).click();
    await expect(page.getByRole("status").filter({ hasText: "取り込みが完了しました。" })).toBeVisible();

    const [updated] = (
      (await (await request.get(`/api/admin/destinations?q=${destination}`)).json()) as { items: { id: number }[] }
    ).items;
    const detail = (await (await request.get(`/api/admin/destinations/${String(updated?.id)}`)).json()) as {
      item: { bestMonths: number[]; status: string };
    };
    expect(detail.item).toMatchObject({ bestMonths: [4, 5], status: "draft" });

    // The stored items now match the file, including the API defaults.
    await checkButton.click();
    await expect(page.getByRole("row", { name: /^旅行先/ })).toContainText(destination);
    await expect(page.getByRole("status").filter({ hasText: "作成または更新する項目はありません。" })).toBeVisible();

    // Countries and questions are updated the same way.
    await input.fill(bundle({ bestMonths: [5, 4], withPortugal: false, countryName: "E2E国（更新）", yesLabel: "はい（更新）" }));
    await checkButton.click();
    await expect(page.getByRole("row", { name: /^国/ })).toContainText(country);
    await expect(page.getByRole("row", { name: /^質問\s/ })).toContainText(question);
    await page.getByText(`質問: ${question} の変更点（1 件）`).click();
    await expect(page.getByRole("row", { name: /options\.yes\.translations\.ja\.label/ })).toContainText("はい（更新）");
    await page.getByRole("button", { name: "取り込む" }).click();
    await expect(page.getByRole("status").filter({ hasText: "取り込みが完了しました。" })).toBeVisible();

    const countries = (await (await request.get("/api/admin/countries")).json()) as {
      items: { slug: string; translations: { ja?: { name: string } } }[];
    };
    expect(countries.items.find((item) => item.slug === country)?.translations.ja?.name).toBe("E2E国（更新）");
    const [storedQuestion] = (
      (await (await request.get(`/api/admin/questions?q=${question}`)).json()) as { items: { id: number }[] }
    ).items;
    const questionDetail = (await (await request.get(`/api/admin/questions/${String(storedQuestion?.id)}`)).json()) as {
      item: { options: { value: string; status: string; translations: { ja?: { label: string } } }[] };
    };
    expect(questionDetail.item.options.map((option) => [option.value, option.status, option.translations.ja?.label])).toEqual([
      ["yes", "active", "はい（更新）"],
      ["no", "active", "いいえ"],
    ]);

    // A question update that would archive an option is refused before anything is written.
    await input.fill(bundle({ bestMonths: [5, 4], withPortugal: false, countryName: "E2E国（更新）", yesLabel: "はい（更新）", withNo: false }));
    await checkButton.click();
    await expect(page.getByRole("alert")).toContainText("questions[0].options[value=no]");
    await expect(page.getByRole("button", { name: "取り込む" })).toHaveCount(0);
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

    await page.getByLabel("Idioma").selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page).toHaveTitle("Travel Discovery — Administration");
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

test.describe("admin layout at phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // The admin console reuses the public LanguageSwitcher without Tailwind, so its icon is sized by admin CSS.
  for (const path of ["/destinations", "/destinations/new", "/questions", "/questions/new", "/countries", "/attributes", "/categories", "/settings", "/import"]) {
    test(`${path} fits the screen and keeps the language icon small`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "読み込み中…" })).toHaveCount(0);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        iconWidth: document.querySelector(".language-switcher svg")?.getBoundingClientRect().width,
      }));
      expect(layout).toEqual({ overflow: 0, iconWidth: 20 });
    });
  }
});
