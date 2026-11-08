import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES } from "../../server/http/request";
import { adminRequest, json } from "./helpers";

let counter = 0;
function uniqueSlug(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(Date.now())}-${String(counter)}`;
}

async function create(path: string, body: unknown): Promise<number> {
  const response = await adminRequest(path, { method: "POST", body });
  const data = await json(response);
  expect(response.status, JSON.stringify(data)).toBe(201);
  return (data as { id: number }).id;
}

async function createFixtures() {
  const countryId = await create("/api/admin/countries", {
    slug: uniqueSlug("country"),
    translations: { ja: { name: "テスト国" }, en: { name: "Testland" } },
  });
  const attributeId = await create("/api/admin/attributes", {
    slug: uniqueSlug("attr"),
    status: "active",
    translations: { en: { name: "Food", description: null } },
  });
  const categoryId = await create("/api/admin/categories", {
    slug: uniqueSlug("cat"),
    status: "active",
    translations: { en: { name: "Style" } },
  });
  return { countryId, attributeId, categoryId };
}

function destinationBody(countryId: number, attributeId: number, overrides: Record<string, unknown> = {}) {
  return {
    slug: uniqueSlug("dest"),
    countryId,
    type: "city",
    status: "draft",
    recommendedDays: { min: 2, max: 4 },
    bestMonths: [],
    costs: [],
    image: null,
    translations: { en: { name: "Test City", summary: "A test city.", highlights: ["One"] } },
    attributeScores: [{ attributeId, score: 3 }],
    ...overrides,
  };
}

function questionBody(categoryId: number, attributeId: number, overrides: Record<string, unknown> = {}) {
  return {
    slug: uniqueSlug("question"),
    categoryId,
    type: "single_choice",
    status: "draft",
    priorityWeight: 5,
    displayOrder: null,
    translations: { ja: { prompt: "質問？" } },
    options: [
      { value: "a", displayOrder: 1, translations: { ja: { label: "A" } }, effects: [{ attributeId, weight: 2 }] },
      { value: "b", displayOrder: 2, translations: { ja: { label: "B" } }, effects: [] },
    ],
    ...overrides,
  };
}

describe("admin CRUD", () => {
  it("creates, reads, updates, and deactivates a destination", async () => {
    const { countryId, attributeId } = await createFixtures();
    const body = destinationBody(countryId, attributeId);
    const id = await create("/api/admin/destinations", body);

    const detail = (await json(await adminRequest(`/api/admin/destinations/${String(id)}`))) as {
      item: { slug: string; status: string; attributeScores: unknown[]; translations: Record<string, unknown> };
    };
    expect(detail.item.slug).toBe(body.slug);
    expect(detail.item.attributeScores).toEqual([{ attributeId, score: 3 }]);

    const updated = destinationBody(countryId, attributeId, {
      slug: body.slug,
      status: "published",
      bestMonths: [10, 4, 5],
      location: { latitude: 13.75, longitude: 100.5 },
      costs: [
        {
          currency: "EUR",
          period: "per_trip",
          scope: "per_person_including_international_flights",
          min: 900,
          max: 1500,
          sourceName: "Other source",
          sourceUrl: null,
          updatedAt: "2026-09-15",
          basis: { en: "Whole trip.", es: "Viaje completo." },
        },
        {
          currency: "JPY",
          period: "per_day",
          scope: "per_person_excluding_international_flights",
          min: 10000,
          max: 20000,
          sourceName: "Test source",
          sourceUrl: "https://example.test/source",
          updatedAt: "2026-10-01",
          basis: { en: "Lodging and meals.", es: "Alojamiento y comidas." },
        },
      ],
      translations: {
        en: { name: "Renamed", summary: "Updated.", highlights: [] },
        es: { name: "Renombrada", summary: "Actualizada.", highlights: [] },
      },
      attributeScores: [],
    });
    const put = await adminRequest(`/api/admin/destinations/${String(id)}`, { method: "PUT", body: updated });
    expect(put.status).toBe(200);

    const after = (await json(await adminRequest(`/api/admin/destinations/${String(id)}`))) as {
      item: {
        status: string;
        bestMonths: number[];
        location: { latitude: number; longitude: number } | null;
        costs: { currency: string; period: string; min: number; basis: Record<string, string> }[];
        attributeScores: unknown[];
        translations: Record<string, unknown>;
      };
    };
    expect(after.item.status).toBe("published");
    expect(after.item.bestMonths).toEqual([4, 5, 10]);
    expect(after.item.location).toEqual({ latitude: 13.75, longitude: 100.5 });
    expect(after.item.costs).toMatchObject([
      { currency: "JPY", period: "per_day", min: 10000, basis: { en: "Lodging and meals.", es: "Alojamiento y comidas." } },
      { currency: "EUR", period: "per_trip", min: 900, basis: { en: "Whole trip.", es: "Viaje completo." } },
    ]);
    expect(after.item.attributeScores).toEqual([]);
    expect(Object.keys(after.item.translations).sort()).toEqual(["en", "es"]);

    const archive = await adminRequest(`/api/admin/destinations/${String(id)}`, {
      method: "PUT",
      body: { ...updated, status: "archived", costs: [], bestMonths: [] },
    });
    expect(archive.status).toBe(200);
    const archived = (await json(await adminRequest(`/api/admin/destinations/${String(id)}`))) as {
      item: { costs: unknown[]; bestMonths: number[] };
    };
    expect(archived.item).toMatchObject({ costs: [], bestMonths: [] });
    const leftovers = await env.ADMIN_DB.prepare(
      `SELECT
         (SELECT count(*) FROM destination_cost_estimates WHERE destination_id = ?1) AS estimates,
         (SELECT count(*) FROM destination_cost_estimate_translations
           WHERE estimate_id NOT IN (SELECT id FROM destination_cost_estimates)) AS orphans`,
    )
      .bind(id)
      .first<{ estimates: number; orphans: number }>();
    expect(leftovers).toEqual({ estimates: 0, orphans: 0 });
    const list = (await json(await adminRequest(`/api/admin/destinations?status=archived&q=${body.slug}`))) as {
      items: { id: number }[];
    };
    expect(list.items.map((item) => item.id)).toContain(id);
  });

  it("upserts options by value and archives omitted options instead of deleting them", async () => {
    const { attributeId, categoryId } = await createFixtures();
    const body = questionBody(categoryId, attributeId);
    const id = await create("/api/admin/questions", body);

    const update = {
      ...body,
      options: [
        { value: "b", displayOrder: 1, translations: { ja: { label: "B2" } }, effects: [{ attributeId, weight: -1 }] },
        { value: "c", displayOrder: 2, translations: { ja: { label: "C" } }, effects: [] },
      ],
    };
    const put = await adminRequest(`/api/admin/questions/${String(id)}`, { method: "PUT", body: update });
    expect(put.status).toBe(200);

    const detail = (await json(await adminRequest(`/api/admin/questions/${String(id)}`))) as {
      item: { options: { id: number; value: string; status: string; translations: { ja?: { label: string } }; effects: unknown[] }[] };
    };
    const byValue = Object.fromEntries(detail.item.options.map((option) => [option.value, option]));
    expect(byValue.a?.status).toBe("archived");
    expect(byValue.a?.translations.ja?.label).toBe("A");
    expect(byValue.b?.status).toBe("active");
    expect(byValue.b?.translations.ja?.label).toBe("B2");
    expect(byValue.b?.effects).toEqual([{ attributeId, weight: -1 }]);
    expect(byValue.c?.status).toBe("active");

    // Re-listing an archived option reactivates it with the same ID.
    const archivedId = byValue.a?.id;
    await adminRequest(`/api/admin/questions/${String(id)}`, { method: "PUT", body });
    const reactivated = (await json(await adminRequest(`/api/admin/questions/${String(id)}`))) as {
      item: { options: { id: number; value: string; status: string }[] };
    };
    const optionA = reactivated.item.options.find((option) => option.value === "a");
    expect(optionA).toMatchObject({ id: archivedId, status: "active" });
  });

  it("manages taxonomy and settings", async () => {
    const { attributeId } = await createFixtures();
    const put = await adminRequest(`/api/admin/attributes/${String(attributeId)}`, {
      method: "PUT",
      body: { slug: uniqueSlug("attr"), status: "archived", translations: { ja: { name: "無効" } } },
    });
    expect(put.status).toBe(200);
    const attributes = (await json(await adminRequest("/api/admin/attributes"))) as {
      items: { id: number; status: string }[];
    };
    expect(attributes.items.find((item) => item.id === attributeId)?.status).toBe("archived");

    const defaults = (await json(await adminRequest("/api/admin/settings"))) as { quiz: unknown };
    expect(defaults.quiz).toEqual({ minQuestions: 6, targetQuestions: 10, maxQuestions: 12, resultCount: 5 });

    const saved = await adminRequest("/api/admin/settings", {
      method: "PUT",
      body: { quiz: { minQuestions: 5, targetQuestions: 8, maxQuestions: 10, resultCount: 3 } },
    });
    expect(await json(saved)).toEqual({ quiz: { minQuestions: 5, targetQuestions: 8, maxQuestions: 10, resultCount: 3 } });
  });
});

describe("admin validation and error responses", () => {
  it("rejects publishing content without a ja or en translation", async () => {
    const { countryId, attributeId, categoryId } = await createFixtures();
    const destination = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(countryId, attributeId, {
        status: "published",
        translations: { es: { name: "Solo español", summary: "Resumen.", highlights: [] } },
      }),
    });
    expect(destination.status).toBe(400);
    expect(await json(destination)).toEqual({
      error: "invalid_request",
      issues: [{ path: "translations", code: "base_locale_required" }],
    });

    const question = await adminRequest("/api/admin/questions", {
      method: "POST",
      body: questionBody(categoryId, attributeId, { status: "published", options: [] }),
    });
    expect(await json(question)).toMatchObject({
      error: "invalid_request",
      issues: [{ path: "options", code: "min_two_options" }],
    });
  });

  it("publishes multiple-choice questions (ADR-021)", async () => {
    const { attributeId, categoryId } = await createFixtures();
    const published = await adminRequest("/api/admin/questions", {
      method: "POST",
      body: questionBody(categoryId, attributeId, { type: "multiple_choice", status: "published" }),
    });
    expect(published.status).toBe(201);
  });

  it("returns field issues for invalid values", async () => {
    const { countryId, attributeId } = await createFixtures();
    const response = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(countryId, attributeId, {
        slug: "Not A Slug",
        recommendedDays: { min: 5, max: 2 },
        image: { url: "http://insecure.example/image.jpg", attribution: "x" },
        attributeScores: [{ attributeId, score: 9 }],
      }),
    });
    expect(response.status).toBe(400);
    const body = (await json(response)) as { issues: { path: string; code: string }[] };
    const paths = body.issues.map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining(["slug", "image.url", "attributeScores.0.score", "recommendedDays.min"]),
    );
  });

  it("validates cost estimates and best months", async () => {
    const { countryId, attributeId } = await createFixtures();
    const estimate = {
      currency: "EUR",
      period: "per_day",
      scope: "per_person_excluding_international_flights",
      min: 1,
      max: 2,
      sourceName: "Source",
      updatedAt: "2026-10-01",
      basis: {},
    };
    const missingBasis = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(countryId, attributeId, { costs: [estimate] }),
    });
    expect(await json(missingBasis)).toMatchObject({
      issues: [{ path: "costs.0.basis.en", code: "cost_basis_required" }],
    });

    const invalid = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(countryId, attributeId, {
        costs: [
          { ...estimate, basis: { en: "Basis." } },
          { ...estimate, basis: { en: "Basis." } },
          { ...estimate, currency: "GBP", period: "per_week", basis: { en: "Basis." } },
        ],
        bestMonths: [4, 4, 13],
      }),
    });
    expect(invalid.status).toBe(400);
    const { issues } = (await json(invalid)) as { issues: { path: string; code: string }[] };
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: "costs.2.currency", code: "invalid_value" },
        { path: "costs.2.period", code: "invalid_value" },
        { path: "bestMonths.2", code: "too_big" },
      ]),
    );

    const duplicates = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(countryId, attributeId, {
        costs: [
          { ...estimate, basis: { en: "Basis." } },
          { ...estimate, basis: { en: "Basis." } },
        ],
        bestMonths: [4, 4],
      }),
    });
    expect(await json(duplicates)).toMatchObject({
      issues: expect.arrayContaining([
        { path: "costs", code: "duplicate_currency" },
        { path: "bestMonths", code: "duplicate_month" },
      ]) as unknown,
    });
  });

  it("accepts a location with both coordinates in range, or none", async () => {
    const { countryId, attributeId } = await createFixtures();
    const issuesFor = async (location: unknown) => {
      const response = await adminRequest("/api/admin/destinations", {
        method: "POST",
        body: destinationBody(countryId, attributeId, { location }),
      });
      return response.status === 201 ? [] : ((await json(response)) as { issues: { path: string; code: string }[] }).issues;
    };

    expect(await issuesFor(null)).toEqual([]);
    expect(await issuesFor(undefined)).toEqual([]);
    expect(await issuesFor({ latitude: -90, longitude: 180 })).toEqual([]);
    expect(await issuesFor({ latitude: 25.04 })).toEqual([{ path: "location.longitude", code: "invalid_type" }]);
    expect(await issuesFor({ latitude: null, longitude: 121.56 })).toEqual([{ path: "location.latitude", code: "invalid_type" }]);
    expect(await issuesFor({ latitude: 90.01, longitude: -180.01 })).toEqual([
      { path: "location.latitude", code: "too_big" },
      { path: "location.longitude", code: "too_small" },
    ]);
  });

  it("returns 409 for duplicate slugs and 400 for unknown references", async () => {
    const { countryId, attributeId } = await createFixtures();
    const body = destinationBody(countryId, attributeId);
    await create("/api/admin/destinations", body);
    const duplicate = await adminRequest("/api/admin/destinations", { method: "POST", body });
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toEqual({ error: "conflict" });

    const badReference = await adminRequest("/api/admin/destinations", {
      method: "POST",
      body: destinationBody(999_999, attributeId),
    });
    expect(badReference.status).toBe(400);
    expect(await json(badReference)).toEqual({ error: "invalid_request" });
  });

  it("does not leave partial rows when a batch fails", async () => {
    const { countryId, attributeId } = await createFixtures();
    const body = destinationBody(countryId, attributeId, { attributeScores: [{ attributeId: 999_999, score: 1 }] });
    const response = await adminRequest("/api/admin/destinations", { method: "POST", body });
    expect(response.status).toBe(400);
    const row = await env.ADMIN_DB.prepare("SELECT id FROM destinations WHERE slug = ?").bind(body.slug).first();
    expect(row).toBeNull();
  });

  it("returns 404 for unknown or malformed IDs", async () => {
    expect((await adminRequest("/api/admin/destinations/999999")).status).toBe(404);
    expect((await adminRequest("/api/admin/questions/abc")).status).toBe(404);
    const { countryId, attributeId } = await createFixtures();
    const put = await adminRequest("/api/admin/destinations/999999", {
      method: "PUT",
      body: destinationBody(countryId, attributeId),
    });
    expect(put.status).toBe(404);
  });

  it("rejects oversized bodies, non-JSON content types, and invalid JSON", async () => {
    const big = await adminRequest("/api/admin/countries", {
      method: "POST",
      body: JSON.stringify({ slug: "x", padding: "x".repeat(MAX_JSON_BODY_BYTES) }),
    });
    expect(big.status).toBe(413);

    const form = await adminRequest("/api/admin/countries", {
      method: "POST",
      body: "slug=x",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(form.status).toBe(415);

    const invalid = await adminRequest("/api/admin/countries", { method: "POST", body: "{not json" });
    expect(await json(invalid)).toEqual({ error: "invalid_request", issues: [{ path: "", code: "invalid_json" }] });
  });

  it("validates settings bounds", async () => {
    const response = await adminRequest("/api/admin/settings", {
      method: "PUT",
      body: { quiz: { minQuestions: 8, targetQuestions: 6, maxQuestions: 12, resultCount: 7 } },
    });
    expect(response.status).toBe(400);
    const body = (await json(response)) as { issues: { path: string; code: string }[] };
    expect(body.issues).toEqual(
      expect.arrayContaining([
        { path: "quiz.resultCount", code: "too_big" },
        { path: "quiz.targetQuestions", code: "target_below_min" },
      ]),
    );
  });

  it("validates list query parameters", async () => {
    const response = await adminRequest("/api/admin/destinations?status=deleted");
    expect(response.status).toBe(400);
  });
});
