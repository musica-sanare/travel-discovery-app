/**
 * Migration 0001 rebuilds `destinations`. D1 enforces foreign keys while
 * migrating, so the rebuild must not cascade-delete destination translations or
 * attribute scores (docs/working/DECISIONS.md ADR-021).
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const db = env.MIGRATION_TEST_DB;
const [initial, ...later] = env.TEST_MIGRATIONS;

// Phase 1 shaped rows, including a legacy single-currency cost.
const PHASE1_FIXTURE = [
  `INSERT INTO countries (id, slug, created_at, updated_at) VALUES (1, 'portugal', 't', 't')`,
  `INSERT INTO attributes (id, slug, status, created_at, updated_at) VALUES (1, 'food', 'active', 't', 't'), (2, 'nature', 'active', 't', 't')`,
  `INSERT INTO destinations (id, slug, country_id, destination_type, recommended_days_min, recommended_days_max,
     cost_min, cost_max, cost_currency, cost_scope, cost_source_name, cost_updated_at, status, created_at, updated_at)
   VALUES
     (7, 'lisbon', 1, 'city', 3, 6, 1000, 2000, 'GBP', 'per_person_excluding_international_flights', 'Legacy', '2026-01-01', 'published', 't', 't'),
     (9, 'porto', 1, 'city', 2, 4, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', 't', 't')`,
  `INSERT INTO destination_translations (destination_id, locale, name, summary, highlights_json, cautions, best_season_text, cost_basis, image_alt)
   VALUES
     (7, 'ja', 'リスボン', '概要', '["a"]', '注意', '春', '宿泊', NULL),
     (7, 'en', 'Lisbon', 'Summary', '["a"]', NULL, 'Spring', 'Lodging', NULL),
     (9, 'en', 'Porto', 'Summary', '[]', NULL, NULL, NULL, NULL)`,
  `INSERT INTO destination_attributes (destination_id, attribute_id, score) VALUES (7, 1, 4), (7, 2, 2), (9, 1, 5)`,
];

async function rows(sql: string) {
  return (await db.prepare(sql).all()).results;
}

describe("migration 0001", () => {
  let translationsBefore: unknown[];
  let scoresBefore: unknown[];

  beforeAll(async () => {
    if (!initial || later.length === 0) throw new Error("expected at least two migrations");
    await applyD1Migrations(db, [initial]);
    await db.batch(PHASE1_FIXTURE.map((sql) => db.prepare(sql)));
    translationsBefore = await rows(
      `SELECT destination_id, locale, name, summary, highlights_json, cautions, best_season_text, image_alt
       FROM destination_translations ORDER BY destination_id, locale`,
    );
    scoresBefore = await rows(`SELECT * FROM destination_attributes ORDER BY destination_id, attribute_id`);
    await applyD1Migrations(db, later);
  });

  it("keeps destination rows and IDs", async () => {
    expect(await rows(`SELECT id, slug, status, best_months_mask FROM destinations ORDER BY id`)).toEqual([
      { id: 7, slug: "lisbon", status: "published", best_months_mask: null },
      { id: 9, slug: "porto", status: "draft", best_months_mask: null },
    ]);
  });

  it("keeps translations (minus the moved cost basis) and attribute scores", async () => {
    expect(await rows(`SELECT * FROM destination_translations ORDER BY destination_id, locale`)).toEqual(translationsBefore);
    expect(await rows(`SELECT * FROM destination_attributes ORDER BY destination_id, attribute_id`)).toEqual(scoresBefore);
  });

  it("drops legacy cost columns and backup tables", async () => {
    const destinationColumns = (await rows(`SELECT name FROM pragma_table_info('destinations')`)).map((row) => row.name);
    expect(destinationColumns).not.toContain("cost_min");
    const translationColumns = (await rows(`SELECT name FROM pragma_table_info('destination_translations')`)).map(
      (row) => row.name,
    );
    expect(translationColumns).not.toContain("cost_basis");
    expect(await rows(`SELECT name FROM sqlite_master WHERE name LIKE '__backup%' OR name LIKE '__new%'`)).toEqual([]);
    expect(await rows(`SELECT * FROM destination_cost_estimates`)).toEqual([]);
  });

  it("enforces foreign keys and constraints after the rebuild (H2)", async () => {
    expect(await rows(`PRAGMA foreign_key_check`)).toEqual([]);
    await expect(
      db.prepare(`INSERT INTO destination_translations (destination_id, locale, name, summary) VALUES (999, 'en', 'x', 'y')`).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(db.prepare(`UPDATE destinations SET best_months_mask = 4096 WHERE id = 7`).run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare(`UPDATE destinations SET best_months_mask = 0 WHERE id = 7`).run()).rejects.toThrow(/CHECK/);

    const insertEstimate = (currency: string, min: number, max: number) =>
      db
        .prepare(
          `INSERT INTO destination_cost_estimates (destination_id, currency, period, scope, min, max, source_name, updated_at)
           VALUES (7, ?1, 'per_day', 'per_person_excluding_international_flights', ?2, ?3, 'S', '2026-10-01')`,
        )
        .bind(currency, min, max)
        .run();
    await insertEstimate("JPY", 1, 2);
    await expect(insertEstimate("JPY", 1, 2)).rejects.toThrow(/UNIQUE/);
    await expect(insertEstimate("GBP", 1, 2)).rejects.toThrow(/CHECK/);
    await expect(insertEstimate("USD", 3, 2)).rejects.toThrow(/CHECK/);

    await db
      .prepare(
        `INSERT INTO destination_cost_estimate_translations (estimate_id, locale, basis)
         SELECT id, 'en', 'Basis' FROM destination_cost_estimates WHERE currency = 'JPY'`,
      )
      .run();
    await db.prepare(`DELETE FROM destinations WHERE id = 7`).run();
    expect(await rows(`SELECT count(*) AS n FROM destination_cost_estimates`)).toEqual([{ n: 0 }]);
    expect(await rows(`SELECT count(*) AS n FROM destination_cost_estimate_translations`)).toEqual([{ n: 0 }]);
  });
});
