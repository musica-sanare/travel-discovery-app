/**
 * Published seed content must have curated ja/en/es translations
 * (docs/DATA_MODEL.md "Design rules"). Drafts may be incomplete.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeeded } from "./helpers";

// Each query returns `label` for every in-scope entity lacking any of ja/en/es.
const CHECKS: Record<string, string> = {
  countries: `
    SELECT c.slug AS label FROM countries c
    WHERE c.id IN (SELECT country_id FROM destinations WHERE status = 'published')
      AND (SELECT count(DISTINCT locale) FROM country_translations t
           WHERE t.country_id = c.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
  attributes: `
    SELECT a.slug AS label FROM attributes a
    WHERE a.status = 'active'
      AND (SELECT count(DISTINCT locale) FROM attribute_translations t
           WHERE t.attribute_id = a.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
  categories: `
    SELECT c.slug AS label FROM question_categories c
    WHERE c.status = 'active'
      AND (SELECT count(DISTINCT locale) FROM question_category_translations t
           WHERE t.category_id = c.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
  destinations: `
    SELECT d.slug AS label FROM destinations d
    WHERE d.status = 'published'
      AND (SELECT count(DISTINCT locale) FROM destination_translations t
           WHERE t.destination_id = d.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
  questions: `
    SELECT q.slug AS label FROM questions q
    WHERE q.status = 'published'
      AND (SELECT count(DISTINCT locale) FROM question_translations t
           WHERE t.question_id = q.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
  options: `
    SELECT q.slug || ':' || o.value AS label FROM question_options o
    JOIN questions q ON q.id = o.question_id
    WHERE q.status = 'published' AND o.status = 'active'
      AND (SELECT count(DISTINCT locale) FROM question_option_translations t
           WHERE t.option_id = o.id AND t.locale IN ('ja', 'en', 'es')) < 3`,
};

async function findIncompleteTranslations(): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const [name, query] of Object.entries(CHECKS)) {
    const { results } = await env.ADMIN_DB.prepare(query).all<{ label: string }>();
    result[name] = results.map((row) => row.label);
  }
  return result;
}

const NONE = {
  countries: [],
  attributes: [],
  categories: [],
  destinations: [],
  questions: [],
  options: [],
};

beforeAll(async () => {
  await ensureSeeded();
});

describe("seed translations", () => {
  it("covers the published seed content it is meant to check", async () => {
    const counts = await env.ADMIN_DB.prepare(
      `SELECT (SELECT count(*) FROM destinations WHERE status = 'published') AS destinations,
              (SELECT count(*) FROM questions WHERE status = 'published') AS questions`,
    ).first<{ destinations: number; questions: number }>();
    expect(counts?.destinations).toBeGreaterThanOrEqual(3);
    expect(counts?.questions).toBeGreaterThanOrEqual(2);
  });

  it("has ja/en/es translations for all published content", async () => {
    expect(await findIncompleteTranslations()).toEqual(NONE);
  });

  it("detects a missing translation in any checked entity", async () => {
    const removals: [string, string, string][] = [
      ["countries", "DELETE FROM country_translations WHERE locale = 'es' AND country_id = (SELECT id FROM countries WHERE slug = 'portugal')", "portugal"],
      ["attributes", "DELETE FROM attribute_translations WHERE locale = 'en' AND attribute_id = (SELECT id FROM attributes WHERE slug = 'food')", "food"],
      ["categories", "DELETE FROM question_category_translations WHERE locale = 'ja' AND category_id = (SELECT id FROM question_categories WHERE slug = 'interests')", "interests"],
      ["destinations", "DELETE FROM destination_translations WHERE locale = 'es' AND destination_id = (SELECT id FROM destinations WHERE slug = 'taipei')", "taipei"],
      ["questions", "DELETE FROM question_translations WHERE locale = 'en' AND question_id = (SELECT id FROM questions WHERE slug = 'pace')", "pace"],
      ["options", "DELETE FROM question_option_translations WHERE locale = 'es' AND option_id = (SELECT o.id FROM question_options o JOIN questions q ON q.id = o.question_id WHERE q.slug = 'main-interest' AND o.value = 'history')", "main-interest:history"],
    ];
    for (const [, sql] of removals) {
      await env.ADMIN_DB.prepare(sql).run();
    }
    const found = await findIncompleteTranslations();
    for (const [entity, , label] of removals) {
      expect(found[entity]).toContain(label);
    }
  });
});
