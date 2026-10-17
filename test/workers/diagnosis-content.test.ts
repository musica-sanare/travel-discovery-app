/**
 * `GET /api/diagnosis-content` (docs/DECISIONS.md ADR-022): published, active
 * content only, ADR-012 locale fallback, strict locale parameter, no caching.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { diagnosisContentSchema, type DiagnosisContentResponse } from "../../shared/diagnosis-content";
import { ensureSeeded, json, publicRequest } from "./helpers";

beforeAll(async () => {
  await ensureSeeded();
});

async function load(query = ""): Promise<DiagnosisContentResponse> {
  const response = await publicRequest(`/api/diagnosis-content${query}`);
  expect(response.status).toBe(200);
  return diagnosisContentSchema.parse(await json(response));
}

async function run(sql: string): Promise<void> {
  await env.ADMIN_DB.prepare(sql).run();
}

describe("GET /api/diagnosis-content", () => {
  it("returns a snapshot that matches the shared contract, defaulting to Japanese", async () => {
    const content = await load();
    expect(content.locale).toBe("ja");
    expect(content.settings).toEqual({ minQuestions: 6, targetQuestions: 10, maxQuestions: 12, resultCount: 5 });
    expect(content.attributes.map((item) => item.slug)).toEqual(["beach", "city-life", "food", "history-culture", "nature"]);
  });

  it("includes only published destinations and questions", async () => {
    const content = await load("?locale=en");
    expect(content.destinations.map((item) => item.slug)).toEqual(["lisbon", "south-iceland", "taipei"]);
    expect(content.questions.map((item) => item.slug).sort()).toEqual(["main-interest", "pace"]);
  });

  it("includes scoring data needed by the engine", async () => {
    const content = await load("?locale=en");
    const pace = content.questions.find((item) => item.slug === "pace");
    expect(pace).toMatchObject({ type: "single_choice", priorityWeight: 5, category: { slug: "travel-style" } });
    expect(pace?.options.find((option) => option.value === "relaxed")?.effects).toEqual([
      { attribute: "beach", weight: 2 },
      { attribute: "city-life", weight: -1 },
    ]);
    const iceland = content.destinations.find((item) => item.slug === "south-iceland");
    expect(iceland?.attributeScores).toContainEqual({ attribute: "nature", score: 5 });
    expect(content.destinations.find((item) => item.slug === "lisbon")?.bestMonths).toEqual([3, 4, 5, 9, 10, 11]);
  });

  it("does not expose internal IDs, statuses, or timestamps", async () => {
    const body = JSON.stringify(await json(await publicRequest("/api/diagnosis-content?locale=en")));
    for (const key of ['"id"', '"status"', '"createdAt"', '"countryId"', '"attributeId"', '"optionId"', '"displayOrder"']) {
      expect(body).not.toContain(key);
    }
  });

  it("rejects unsupported locales and answers without caching", async () => {
    const invalid = await publicRequest("/api/diagnosis-content?locale=fr");
    expect(invalid.status).toBe(400);
    expect(await json(invalid)).toEqual({ error: "invalid_request", issues: [{ path: "locale", code: "invalid_value" }] });
    const ok = await publicRequest("/api/diagnosis-content?locale=es");
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect((await publicRequest("/api/diagnosis-content", { method: "HEAD" })).status).toBe(200);
    expect((await publicRequest("/api/diagnosis-content", { method: "POST" })).status).toBe(405);
  });

  it("uses validated stored settings and falls back to defaults when invalid", async () => {
    await run(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('quiz', '{"minQuestions":4,"targetQuestions":8,"maxQuestions":9,"resultCount":3}', 't')
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    );
    expect((await load()).settings).toEqual({ minQuestions: 4, targetQuestions: 8, maxQuestions: 9, resultCount: 3 });
    await run(`UPDATE app_settings SET value_json = '{"minQuestions":9,"targetQuestions":2}' WHERE key = 'quiz'`);
    expect((await load()).settings).toEqual({ minQuestions: 6, targetQuestions: 10, maxQuestions: 12, resultCount: 5 });
    await run(`DELETE FROM app_settings WHERE key = 'quiz'`);
  });

  it("drops archived options, inactive attributes and their effects, and inactive categories", async () => {
    await run(`UPDATE question_options SET status = 'archived' WHERE value = 'history'`);
    await run(`UPDATE attributes SET status = 'archived' WHERE slug = 'city-life'`);
    const content = await load("?locale=en");
    const interest = content.questions.find((item) => item.slug === "main-interest");
    expect(interest?.options.map((option) => option.value)).toEqual(["food", "scenery"]);
    expect(content.attributes.map((item) => item.slug)).not.toContain("city-life");
    const pace = content.questions.find((item) => item.slug === "pace");
    expect(pace?.options.flatMap((option) => option.effects.map((effect) => effect.attribute))).not.toContain("city-life");
    expect(content.destinations.flatMap((item) => item.attributeScores.map((score) => score.attribute))).not.toContain(
      "city-life",
    );

    await run(`UPDATE question_categories SET status = 'archived' WHERE slug = 'interests'`);
    expect((await load()).questions.map((item) => item.slug)).toEqual(["pace"]);

    await run(`UPDATE question_options SET status = 'active' WHERE value = 'history'`);
    await run(`UPDATE attributes SET status = 'active' WHERE slug = 'city-life'`);
    await run(`UPDATE question_categories SET status = 'active' WHERE slug = 'interests'`);
  });

  it("follows the locale fallback chain and reports the locale used", async () => {
    await run(
      `DELETE FROM question_translations WHERE locale = 'es' AND question_id = (SELECT id FROM questions WHERE slug = 'pace')`,
    );
    await run(
      `DELETE FROM destination_translations WHERE locale IN ('es', 'en') AND destination_id = (SELECT id FROM destinations WHERE slug = 'taipei')`,
    );
    const content = await load("?locale=es");
    expect(content.questions.find((item) => item.slug === "pace")).toMatchObject({
      locale: "en",
      prompt: "What travel pace do you prefer?",
    });
    expect(content.questions.find((item) => item.slug === "main-interest")?.locale).toBe("es");
    expect(content.destinations.find((item) => item.slug === "taipei")).toMatchObject({ locale: "ja", name: "台北" });
  });
});
