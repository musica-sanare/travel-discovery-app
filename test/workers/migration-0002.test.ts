/**
 * Migration 0002 rebuilds the seven translation tables so their locale CHECK
 * constraints accept `fr` (docs/working/DECISIONS.md ADR-032). The rebuild must
 * keep every row and the foreign keys to the parent tables.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const db = env.MIGRATION_0002_TEST_DB;
const before0002 = env.TEST_MIGRATIONS.filter((migration) => migration.name < "0002");
const from0002 = env.TEST_MIGRATIONS.filter((migration) => migration.name >= "0002");

const TRANSLATION_TABLES = {
  country_translations: "country_id, locale",
  attribute_translations: "attribute_id, locale",
  question_category_translations: "category_id, locale",
  destination_translations: "destination_id, locale",
  destination_cost_estimate_translations: "estimate_id, locale",
  question_translations: "question_id, locale",
  question_option_translations: "option_id, locale",
} as const;

// Rows shaped by migrations 0000 and 0001, in the three locales they allow.
const FIXTURE = [
  `INSERT INTO countries (id, slug, created_at, updated_at) VALUES (1, 'portugal', 't', 't')`,
  `INSERT INTO country_translations (country_id, locale, name) VALUES (1, 'ja', 'ポルトガル'), (1, 'en', 'Portugal'), (1, 'es', 'Portugal')`,
  `INSERT INTO attributes (id, slug, created_at, updated_at) VALUES (2, 'food', 't', 't')`,
  `INSERT INTO attribute_translations (attribute_id, locale, name, description) VALUES (2, 'ja', '食', NULL), (2, 'en', 'Food', 'Eating'), (2, 'es', 'Comida', NULL)`,
  `INSERT INTO question_categories (id, slug, created_at, updated_at) VALUES (3, 'interests', 't', 't')`,
  `INSERT INTO question_category_translations (category_id, locale, name) VALUES (3, 'en', 'Interests'), (3, 'es', 'Intereses')`,
  `INSERT INTO destinations (id, slug, country_id, destination_type, status, created_at, updated_at) VALUES (4, 'lisbon', 1, 'city', 'published', 't', 't')`,
  `INSERT INTO destination_translations (destination_id, locale, name, summary, highlights_json, cautions, best_season_text, image_alt)
   VALUES (4, 'ja', 'リスボン', '概要', '["a"]', '注意', '春', NULL), (4, 'es', 'Lisboa', 'Resumen', '[]', NULL, NULL, 'Tranvía')`,
  `INSERT INTO destination_cost_estimates (id, destination_id, currency, period, scope, min, max, source_name, updated_at)
   VALUES (5, 4, 'EUR', 'per_day', 'per_person_excluding_international_flights', 80, 150, 'S', '2026-10-01')`,
  `INSERT INTO destination_cost_estimate_translations (estimate_id, locale, basis) VALUES (5, 'en', 'Lodging and meals.'), (5, 'es', 'Alojamiento y comidas.')`,
  `INSERT INTO questions (id, slug, category_id, question_type, status, created_at, updated_at) VALUES (6, 'pace', 3, 'single_choice', 'published', 't', 't')`,
  `INSERT INTO question_translations (question_id, locale, prompt, description) VALUES (6, 'ja', 'ペースは？', NULL), (6, 'es', '¿Ritmo?', 'Elige')`,
  `INSERT INTO question_options (id, question_id, value) VALUES (7, 6, 'relaxed')`,
  `INSERT INTO question_option_translations (option_id, locale, label) VALUES (7, 'en', 'Relaxed'), (7, 'es', 'Tranquilo')`,
];

async function rows(sql: string) {
  return (await db.prepare(sql).all()).results;
}

async function snapshot() {
  const entries = await Promise.all(
    Object.entries(TRANSLATION_TABLES).map(async ([table, order]) => [table, await rows(`SELECT * FROM ${table} ORDER BY ${order}`)]),
  );
  return Object.fromEntries(entries) as Record<string, unknown[]>;
}

describe("migration 0002", () => {
  let tablesBefore: Record<string, unknown[]>;

  beforeAll(async () => {
    if (before0002.length !== 2 || from0002.length === 0) throw new Error("expected migrations 0000, 0001, and 0002");
    await applyD1Migrations(db, before0002);
    await db.batch(FIXTURE.map((sql) => db.prepare(sql)));
    tablesBefore = await snapshot();
    await applyD1Migrations(db, from0002);
  });

  it("keeps every translation row", async () => {
    expect(Object.values(tablesBefore).every((table) => table.length > 0)).toBe(true);
    expect(await snapshot()).toEqual(tablesBefore);
  });

  it("accepts fr and still rejects unsupported locales in every table", async () => {
    await db.batch([
      db.prepare(`INSERT INTO country_translations (country_id, locale, name) VALUES (1, 'fr', 'Portugal')`),
      db.prepare(`INSERT INTO attribute_translations (attribute_id, locale, name) VALUES (2, 'fr', 'Gastronomie')`),
      db.prepare(`INSERT INTO question_category_translations (category_id, locale, name) VALUES (3, 'fr', 'Centres d’intérêt')`),
      db.prepare(`INSERT INTO destination_translations (destination_id, locale, name, summary) VALUES (4, 'fr', 'Lisbonne', 'Résumé')`),
      db.prepare(`INSERT INTO destination_cost_estimate_translations (estimate_id, locale, basis) VALUES (5, 'fr', 'Hébergement et repas.')`),
      db.prepare(`INSERT INTO question_translations (question_id, locale, prompt) VALUES (6, 'fr', 'Rythme ?')`),
      db.prepare(`INSERT INTO question_option_translations (option_id, locale, label) VALUES (7, 'fr', 'Détendu')`),
    ]);
    for (const [table, order] of Object.entries(TRANSLATION_TABLES)) {
      const key = order.split(",")[0] ?? "";
      expect(await rows(`SELECT count(*) AS n FROM ${table} WHERE locale = 'fr'`), table).toEqual([{ n: 1 }]);
      await expect(db.prepare(`UPDATE ${table} SET locale = 'de' WHERE locale = 'fr' AND ${key} > 0`).run(), table).rejects.toThrow(
        /CHECK/,
      );
    }
  });

  it("keeps foreign keys, cascades, and leaves no temporary tables", async () => {
    expect(await rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(await rows(`SELECT name FROM sqlite_master WHERE name LIKE '__new%'`)).toEqual([]);
    await expect(
      db.prepare(`INSERT INTO destination_translations (destination_id, locale, name, summary) VALUES (999, 'fr', 'x', 'y')`).run(),
    ).rejects.toThrow(/FOREIGN KEY/);

    await db.prepare(`DELETE FROM destinations WHERE id = 4`).run();
    expect(await rows(`SELECT count(*) AS n FROM destination_translations`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*) AS n FROM destination_cost_estimate_translations`)).toEqual([{ n: 0 }]);
  });
});
