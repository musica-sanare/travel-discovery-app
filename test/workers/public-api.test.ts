import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { app as publicApp } from "../../worker/index";
import { ensureSeeded, json, publicRequest } from "./helpers";

beforeAll(async () => {
  await ensureSeeded();
});

interface PublicDestination {
  slug: string;
  locale: string;
  name: string;
  country: { slug: string; name: string | null; locale: string | null };
  costs: unknown[];
  bestMonths: number[] | null;
  [key: string]: unknown;
}

const ADMIN_ONLY_FIELDS = ["id", "status", "createdAt", "updatedAt", "countryId", "attributeScores"];

describe("public API basics", () => {
  it("serves health checks", async () => {
    const response = await publicRequest("/api/health");
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects %s on every path with 405", async (method) => {
    for (const path of ["/api/health", "/api/destinations", "/api/questions", "/api/admin/destinations"]) {
      const response = await publicRequest(path, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD");
    }
  });

  it("has no admin routes", async () => {
    const response = await publicRequest("/api/admin/destinations");
    expect(response.status).toBe(404);
  });

  it.each([
    "Lisbon",
    "lis_bon",
    "-lisbon",
    "lisbon-",
    "lis--bon",
    "%E0%A4%A",
    "lisbon%20x",
    "a".repeat(65),
    "a".repeat(5000),
  ])("returns 404 for slug %s without querying D1", async (slug) => {
    let touched = false;
    const db = new Proxy({} as D1Database, {
      get() {
        touched = true;
        throw new Error("D1 must not be used");
      },
    });
    const response = await publicApp.fetch(
      new Request(`https://public.example.test/api/destinations/${slug}`),
      { PUBLIC_DB: db },
    );
    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "not_found" });
    expect(touched).toBe(false);
  });

  it("still serves valid slugs, including the maximum length", async () => {
    expect((await publicRequest("/api/destinations/south-iceland")).status).toBe(200);
    expect((await publicRequest(`/api/destinations/${"a".repeat(64)}`)).status).toBe(404);
  });

  it("rejects unsupported locales", async () => {
    const response = await publicRequest("/api/destinations?locale=fr");
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "invalid_request",
      issues: [{ path: "locale", code: "invalid_value" }],
    });
  });
});

describe("publication filtering", () => {
  it("lists only published destinations, without admin-only fields", async () => {
    const response = await publicRequest("/api/destinations?locale=en");
    const { items } = (await json(response)) as { items: PublicDestination[] };
    const slugs = items.map((item) => item.slug);
    expect(slugs).toEqual(expect.arrayContaining(["lisbon", "taipei", "south-iceland"]));
    expect(slugs).not.toContain("da-nang");
    for (const item of items) {
      for (const field of ADMIN_ONLY_FIELDS) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });

  it("returns 404 for draft and archived destinations", async () => {
    expect((await publicRequest("/api/destinations/da-nang")).status).toBe(404);

    await env.ADMIN_DB.prepare("UPDATE destinations SET status = 'archived' WHERE slug = 'taipei'").run();
    try {
      expect((await publicRequest("/api/destinations/taipei")).status).toBe(404);
      const { items } = (await json(await publicRequest("/api/destinations"))) as { items: PublicDestination[] };
      expect(items.map((item) => item.slug)).not.toContain("taipei");
    } finally {
      await env.ADMIN_DB.prepare("UPDATE destinations SET status = 'published' WHERE slug = 'taipei'").run();
    }
  });

  it("lists only published questions with active options and no scoring data", async () => {
    const { items } = (await json(await publicRequest("/api/questions?locale=ja"))) as {
      items: { slug: string; options: { value: string }[]; [key: string]: unknown }[];
    };
    expect(items.map((item) => item.slug)).toEqual(["pace", "main-interest"]);
    for (const item of items) {
      expect(item).not.toHaveProperty("priorityWeight");
      expect(item).not.toHaveProperty("status");
      for (const option of item.options) {
        expect(option).not.toHaveProperty("effects");
        expect(option).not.toHaveProperty("id");
      }
    }

    await env.ADMIN_DB.prepare(
      "UPDATE question_options SET status = 'archived' WHERE value = 'history'",
    ).run();
    try {
      const after = (await json(await publicRequest("/api/questions"))) as {
        items: { slug: string; options: { value: string }[] }[];
      };
      const interest = after.items.find((item) => item.slug === "main-interest");
      expect(interest?.options.map((option) => option.value)).toEqual(["food", "scenery"]);
    } finally {
      await env.ADMIN_DB.prepare("UPDATE question_options SET status = 'active' WHERE value = 'history'").run();
    }
  });

  it("hides questions whose category is archived", async () => {
    await env.ADMIN_DB.prepare("UPDATE question_categories SET status = 'archived' WHERE slug = 'interests'").run();
    try {
      const { items } = (await json(await publicRequest("/api/questions"))) as { items: { slug: string }[] };
      expect(items.map((item) => item.slug)).toEqual(["pace"]);
    } finally {
      await env.ADMIN_DB.prepare("UPDATE question_categories SET status = 'active' WHERE slug = 'interests'").run();
    }
  });
});

describe("localization and fallback", () => {
  it("defaults to Japanese", async () => {
    const { item } = (await json(await publicRequest("/api/destinations/lisbon"))) as { item: PublicDestination };
    expect(item).toMatchObject({ locale: "ja", name: "リスボン", country: { name: "ポルトガル", locale: "ja" } });
  });

  it("returns Spanish content when available", async () => {
    const { item } = (await json(await publicRequest("/api/destinations/lisbon?locale=es"))) as {
      item: PublicDestination;
    };
    expect(item).toMatchObject({ locale: "es", name: "Lisboa" });
  });

  it("follows es → en → ja when a translation is missing", async () => {
    await env.ADMIN_DB.prepare(
      "DELETE FROM destination_translations WHERE locale = 'es' AND destination_id = (SELECT id FROM destinations WHERE slug = 'south-iceland')",
    ).run();
    const { item } = (await json(await publicRequest("/api/destinations/south-iceland?locale=es"))) as {
      item: PublicDestination;
    };
    expect(item).toMatchObject({ locale: "en", name: "South Iceland" });

    await env.ADMIN_DB.prepare(
      "DELETE FROM destination_translations WHERE locale = 'en' AND destination_id = (SELECT id FROM destinations WHERE slug = 'south-iceland')",
    ).run();
    const jaFallback = (await json(await publicRequest("/api/destinations/south-iceland?locale=es"))) as {
      item: PublicDestination;
    };
    expect(jaFallback.item).toMatchObject({ locale: "ja", name: "アイスランド南部" });
  });

  it("does not present missing costs as zero", async () => {
    const { item } = (await json(await publicRequest("/api/destinations/lisbon"))) as { item: PublicDestination };
    expect(item.costs).toEqual([]);
  });

  it("returns structured best months, or null when unknown", async () => {
    const lisbon = (await json(await publicRequest("/api/destinations/lisbon"))) as { item: PublicDestination };
    expect(lisbon.item.bestMonths).toEqual([3, 4, 5, 9, 10, 11]);
    const iceland = (await json(await publicRequest("/api/destinations/south-iceland"))) as { item: PublicDestination };
    expect(iceland.item.bestMonths).toBeNull();
  });

  it("returns cost estimates with a localized basis and no internal IDs", async () => {
    await env.ADMIN_DB.batch([
      env.ADMIN_DB.prepare(
        `INSERT INTO destination_cost_estimates
           (destination_id, currency, period, scope, min, max, source_name, source_url, updated_at)
         SELECT id, 'USD', 'per_day', 'per_person_excluding_international_flights', 80, 150,
           'Illustrative test source', NULL, '2026-10-01'
         FROM destinations WHERE slug = 'taipei'`,
      ),
      env.ADMIN_DB.prepare(
        `INSERT INTO destination_cost_estimate_translations (estimate_id, locale, basis)
         SELECT e.id, 'ja', '宿泊と食事' FROM destination_cost_estimates e
         JOIN destinations d ON d.id = e.destination_id WHERE d.slug = 'taipei'`,
      ),
    ]);
    const { item } = (await json(await publicRequest("/api/destinations/taipei?locale=en"))) as {
      item: PublicDestination;
    };
    expect(item.costs).toEqual([
      {
        currency: "USD",
        period: "per_day",
        scope: "per_person_excluding_international_flights",
        min: 80,
        max: 150,
        basis: "宿泊と食事",
        basisLocale: "ja",
        sourceName: "Illustrative test source",
        sourceUrl: null,
        updatedAt: "2026-10-01",
      },
    ]);
  });
});
