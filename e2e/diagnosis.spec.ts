import { expect, test } from "@playwright/test";
import { answerAllQuestions, mockAiOffered, startQuiz, unexpectedRequests, watchPage } from "./fixtures";

test.describe("core journey without AI", () => {
  test("landing → constraints → quiz → results", async ({ page, baseURL }) => {
    const { errors, requests } = watchPage(page);
    await startQuiz(page);

    await page.getByLabel(/旅行日数/).fill("4");
    await page.getByLabel("4月").check();
    await page.getByLabel("金額").fill("200000");
    await expect(page.getByLabel("AI アシストを使う")).not.toBeChecked();
    await page.getByRole("button", { name: "質問に進む" }).click();

    await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();
    expect(await answerAllQuestions(page)).toBeGreaterThan(0);

    const results = page.getByRole("article");
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThanOrEqual(1);
    expect(await results.count()).toBeLessThanOrEqual(5);
    await expect(results.first().getByText(/^相対的な適合度: \d+ \/ 100$/)).toBeVisible();
    await expect(page.getByText("現在の登録データに基づく相対的な目安です。確率や保証ではありません。")).toBeVisible();

    const flights = results.first().getByRole("link", { name: /Google Flightsで航空券を探す/ });
    await expect(flights).toHaveAttribute("href", "https://www.google.com/travel/flights");
    await expect(flights).toHaveAttribute("target", "_blank");
    await expect(flights).toHaveAttribute("rel", "noopener noreferrer");

    // No AI endpoint and no other API calls; answers never leave the browser.
    expect(unexpectedRequests(requests, baseURL ?? "")).toEqual([]);
    expect(
      requests.filter((url) => url.includes("/api/")).every((url) => url.includes("/api/diagnosis-content?locale=ja") || url.endsWith("/api/ai/status")),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test("back, edit, and restart", async ({ page }) => {
    await startQuiz(page);
    await page.getByRole("button", { name: "質問に進む" }).click();
    const first = page.getByRole("group").locator("input").first();
    await first.check();
    await page.getByRole("button", { name: "次へ" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^質問 2 \/ \d+$/ })).toBeVisible();

    await page.getByRole("button", { name: "前の質問に戻る" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();
    await expect(page.getByRole("group").locator("input").first()).toBeChecked();

    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("button", { name: "この質問をスキップ" }).click();
    await answerAllQuestions(page);
    await expect(page.getByText("スキップ", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "回答を見直す" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();

    await page.getByRole("button", { name: "最初からやり直す" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();
    await expect(page.getByRole("group").locator("input:checked")).toHaveCount(0);
  });

  test("a reload restarts the quiz and stores nothing but the language", async ({ page }) => {
    await startQuiz(page);
    await page.getByLabel(/旅行日数/).fill("5");
    await page.getByRole("button", { name: "質問に進む" }).click();
    await page.getByRole("group").locator("input").first().check();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "旅の条件（任意）" })).toBeVisible();
    await expect(page.getByLabel(/旅行日数/)).toHaveValue("");
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookies: document.cookie,
    }));
    expect(stored).toEqual({ local: [], session: [], cookies: "" });
  });
});

test.describe("languages", () => {
  test.use({ locale: "es-MX" });

  test("detects the browser language and keeps a manual choice across reloads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Encuentra un destino en el extranjero hecho para ti");

    await page.getByLabel("Idioma").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find an overseas destination that suits you");
    expect(await page.evaluate(() => localStorage.getItem("travel-discovery.locale"))).toBe("en");
  });

  test("switching language mid-quiz keeps progress", async ({ page }) => {
    await page.goto("/plan");
    await page.getByRole("button", { name: "Continuar a las preguntas" }).click();
    await page.getByRole("group").locator("input").first().check();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Pregunta 2 de \d+$/ })).toBeVisible();
    await page.getByLabel("Idioma").selectOption("ja");
    await expect(page.getByRole("heading", { level: 1, name: /^質問 2 \/ \d+$/ })).toBeVisible();
  });
});

test.describe("error and empty data", () => {
  test("shows a retryable error when the content API fails", async ({ page }) => {
    let fail = true;
    await page.route("**/api/diagnosis-content**", (route) =>
      fail ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"service_unavailable"}' }) : route.continue(),
    );
    await startQuiz(page);
    await page.getByRole("button", { name: "質問に進む" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("現在ご利用いただけません");
    fail = false;
    await alert.getByRole("button", { name: "再読み込み" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^質問 1 \/ \d+$/ })).toBeVisible();
  });

  test("treats a non-JSON platform error page as unavailable", async ({ page }) => {
    await page.route("**/api/diagnosis-content**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>Error 1027</html>" }),
    );
    await startQuiz(page);
    await page.getByRole("button", { name: "質問に進む" }).click();
    await expect(page.getByRole("alert")).toContainText("現在ご利用いただけません");
  });

  test("handles empty published content", async ({ page }) => {
    await page.route("**/api/diagnosis-content**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locale: "ja",
          settings: { minQuestions: 6, targetQuestions: 10, maxQuestions: 12, resultCount: 5 },
          attributes: [],
          questions: [],
          destinations: [],
        }),
      }),
    );
    await startQuiz(page);
    await page.getByRole("button", { name: "質問に進む" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "あなたへのおすすめ" })).toBeVisible();
    await expect(page.getByText("条件に合う旅行先が見つかりませんでした。条件を変えてお試しください。")).toBeVisible();
    await expect(page.getByText("質問の数が少ないため、通常より短い診断になりました。")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });
});

test.describe("optional AI notes", () => {
  const AI_PATH = "/api/ai/explanations";
  const AI_TEXT = "ゆったりとした街歩きと豊かな食文化があり、あなたの好みに合いそうな旅行先です。";

  test("against the real server, AI is not offered: the toggle is disabled and no AI request is sent", async ({ page, baseURL }) => {
    // The preview server has no AI configuration, so the status endpoint reports AI as off.
    const { errors, requests } = watchPage(page);
    await startQuiz(page);
    await expect(page.getByText("現在、AI アシストは提供していません。診断はこのままご利用いただけます。")).toBeVisible();
    await expect(page.getByLabel("AI アシストを使う")).toBeDisabled();
    await expect(page.getByLabel("AI アシストを使う")).not.toBeChecked();
    await expect(page.getByText(/1 分間に 5 回、1 日（UTC 基準）に 30 回までです/)).toBeVisible();
    await page.getByRole("button", { name: "質問に進む" }).click();
    await answerAllQuestions(page);
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(requests.filter((url) => new URL(url).pathname === AI_PATH)).toEqual([]);
    expect(unexpectedRequests(requests, baseURL ?? "")).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("toggle on against the real AI endpoint while it is disabled: one request, unavailable notice, results intact", async ({ page }) => {
    await mockAiOffered(page);
    const aiResponses: number[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === AI_PATH) aiResponses.push(response.status());
    });
    await startQuiz(page);
    await page.getByLabel("AI アシストを使う").check();
    await page.getByRole("button", { name: "質問に進む" }).click();
    await answerAllQuestions(page);
    await expect(page.getByRole("status").filter({ hasText: "AI アシストは現在利用できません" })).toBeVisible();
    await expect(page.getByRole("article").first()).toBeVisible();
    expect(aiResponses).toEqual([503]);
  });

  test("toggle on with a mocked AI response shows labelled notes in rank order", async ({ page }) => {
    await mockAiOffered(page);
    const bodies: { expected: string[]; answers: unknown[] }[] = [];
    await page.route(`**${AI_PATH}`, async (route) => {
      const body = route.request().postDataJSON() as { expected: string[]; answers: unknown[] };
      bodies.push(body);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ explanations: [...body.expected].reverse().map((slug) => ({ slug, text: AI_TEXT })) }),
      });
    });
    await startQuiz(page);
    await page.getByLabel("AI アシストを使う").check();
    await page.getByRole("button", { name: "質問に進む" }).click();
    await answerAllQuestions(page);
    await expect(page.getByRole("status").filter({ hasText: "各旅行先に AI による補足を追加しました。" })).toBeVisible();
    const articles = page.getByRole("article");
    const count = await articles.count();
    await expect(page.getByRole("heading", { level: 3, name: "AI による補足" })).toHaveCount(count);
    for (const article of await articles.all()) {
      await expect(article.getByText(AI_TEXT)).toBeVisible();
      await expect(article.getByText("AI が生成した文章です。")).toBeVisible();
    }
    expect(bodies).toHaveLength(1);
    const [body] = bodies;
    expect(Object.keys(body ?? {}).sort()).toEqual(["answers", "constraints", "expected", "locale"]);
    const order = await articles.evaluateAll((items) => items.map((item) => item.getAttribute("aria-labelledby")));
    expect(order).toEqual(body?.expected.map((slug) => `result-${slug}`));
  });

  test("toggle off makes no AI request", async ({ page }) => {
    let aiRequests = 0;
    await page.route(`**${AI_PATH}`, async (route) => {
      aiRequests += 1;
      await route.abort();
    });
    await startQuiz(page);
    await expect(page.getByLabel("AI アシストを使う")).not.toBeChecked();
    await page.getByRole("button", { name: "質問に進む" }).click();
    await answerAllQuestions(page);
    await expect(page.getByRole("article").first()).toBeVisible();
    expect(aiRequests).toBe(0);
    await expect(page.getByRole("heading", { name: "AI による補足" })).toHaveCount(0);
  });

  const LIMIT_TEXTS = [
    {
      locale: "ja",
      toggle: "AI アシストを使う",
      submit: "質問に進む",
      window: "AI による補足の作成回数が 1 分間の上限に達しました。1 分ほどたつと、再びご利用いただけます。",
      daily: "本日分（UTC 基準）の AI による補足の作成回数が上限に達しました。",
    },
    {
      locale: "en",
      toggle: "Use AI assistance",
      submit: "Continue to questions",
      window: "You have reached the per-minute limit for AI notes. You can use them again in about a minute.",
      daily: "You have reached today's limit for AI notes (days start at 00:00 UTC).",
    },
    {
      locale: "es",
      toggle: "Usar asistencia de IA",
      submit: "Continuar a las preguntas",
      window: "Has alcanzado el límite de notas de IA por minuto. Podrás volver a usarlas en aproximadamente un minuto.",
      daily: "Has alcanzado el límite diario de notas de IA (el día empieza a las 00:00 UTC).",
    },
  ] as const;

  for (const texts of LIMIT_TEXTS) {
    for (const limit of ["window", "daily"] as const) {
      test(`names the ${limit} limit of a mocked 429 in ${texts.locale}`, async ({ page }) => {
        await mockAiOffered(page);
        await page.addInitScript((locale) => {
          localStorage.setItem("travel-discovery.locale", locale);
        }, texts.locale);
        // Like the server: the window ends within a minute, the day at the next 00:00 UTC.
        const untilMidnight = () => Math.ceil((86_400_000 - (Date.now() % 86_400_000)) / 1000);
        await page.route(`**${AI_PATH}`, (route) => {
          const retryAfter = limit === "window" ? 40 : untilMidnight();
          return route.fulfill({
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
            contentType: "application/json",
            body: JSON.stringify({ error: "rate_limited", limit, retryAfter }),
          });
        });
        await page.goto("/plan");
        await page.getByLabel(texts.toggle).check();
        await page.getByRole("button", { name: texts.submit }).click();
        await answerAllQuestions(page);
        const status = page.getByRole("status");
        await expect(status).toContainText(texts[limit]);
        if (limit === "daily") {
          // 00:00 UTC is shown in the browser's time zone, on the hour.
          await expect(status).toContainText(/\d{1,2}:00/);
        }
        await expect(page.getByRole("article").first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      });
    }
  }
});
