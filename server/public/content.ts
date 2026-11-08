/**
 * Read-only queries for the public Worker. Only published content is
 * returned, with explicit public fields; admin metadata (internal IDs, status,
 * timestamps) never leaves this module. This module must not import write
 * helpers (enforced by ESLint and worker/boundary.test.ts).
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { compareCurrencies } from "../../shared/costs";
import type { Locale } from "../../shared/locales";
import { maskToMonths } from "../../shared/months";
import type { Database } from "../db/client";
import { destinations, questions } from "../db/schema";
import { pickTranslation } from "../localization";

const highlightsSchema = z.array(z.string());

function parseHighlights(json: string): string[] {
  try {
    const parsed = highlightsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

const destinationColumns = {
  id: true,
  slug: true,
  destinationType: true,
  recommendedDaysMin: true,
  recommendedDaysMax: true,
  bestMonthsMask: true,
  latitude: true,
  longitude: true,
  imageUrl: true,
  imageAttribution: true,
} as const;

export async function loadPublishedDestinations(db: Database, slug?: string) {
  return db.query.destinations.findMany({
    columns: destinationColumns,
    where: slug
      ? and(eq(destinations.status, "published"), eq(destinations.slug, slug))
      : eq(destinations.status, "published"),
    orderBy: asc(destinations.slug),
    with: {
      translations: true,
      country: { columns: { slug: true }, with: { translations: true } },
      costEstimates: {
        columns: {
          id: true,
          currency: true,
          period: true,
          scope: true,
          min: true,
          max: true,
          sourceName: true,
          sourceUrl: true,
          updatedAt: true,
        },
        with: { translations: true },
      },
    },
  });
}

export type LoadedDestination = Awaited<ReturnType<typeof loadPublishedDestinations>>[number];

export function toPublicDestination(row: LoadedDestination, locale: Locale) {
  const text = pickTranslation(row.translations, locale);
  if (!text) {
    return undefined;
  }
  const countryText = pickTranslation(row.country.translations, locale);

  const costs = [...row.costEstimates]
    .sort((a, b) => compareCurrencies(a.currency, b.currency))
    .map((estimate) => {
      const basis = pickTranslation(estimate.translations, locale);
      return {
        currency: estimate.currency,
        period: estimate.period,
        scope: estimate.scope,
        min: estimate.min,
        max: estimate.max,
        basis: basis?.basis ?? null,
        basisLocale: basis?.locale ?? null,
        sourceName: estimate.sourceName,
        sourceUrl: estimate.sourceUrl,
        updatedAt: estimate.updatedAt,
      };
    });

  return {
    slug: row.slug,
    locale: text.locale,
    type: row.destinationType,
    name: text.name,
    summary: text.summary,
    highlights: parseHighlights(text.highlightsJson),
    cautions: text.cautions,
    bestSeason: text.bestSeasonText,
    recommendedDays: { min: row.recommendedDaysMin, max: row.recommendedDaysMax },
    bestMonths: maskToMonths(row.bestMonthsMask),
    location:
      row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
    country: {
      slug: row.country.slug,
      name: countryText?.name ?? null,
      locale: countryText?.locale ?? null,
    },
    costs,
    image: row.imageUrl
      ? { url: row.imageUrl, alt: text.imageAlt, attribution: row.imageAttribution }
      : null,
  };
}

export type PublicDestination = NonNullable<ReturnType<typeof toPublicDestination>>;

export async function listPublishedDestinations(
  db: Database,
  locale: Locale,
): Promise<PublicDestination[]> {
  const rows = await loadPublishedDestinations(db);
  return rows.flatMap((row) => toPublicDestination(row, locale) ?? []);
}

export async function getPublishedDestination(
  db: Database,
  slug: string,
  locale: Locale,
): Promise<PublicDestination | undefined> {
  const [row] = await loadPublishedDestinations(db, slug);
  return row ? toPublicDestination(row, locale) : undefined;
}

/**
 * Published questions in active categories, with active options. Scoring data
 * (option effects, priority weights) is intentionally not exposed here.
 */
export async function listPublishedQuestions(db: Database, locale: Locale) {
  const rows = await db.query.questions.findMany({
    columns: { id: true, slug: true, questionType: true, displayOrder: true },
    where: eq(questions.status, "published"),
    orderBy: [asc(questions.displayOrder), asc(questions.slug)],
    with: {
      translations: true,
      category: { columns: { slug: true, status: true }, with: { translations: true } },
      options: {
        columns: { id: true, value: true, displayOrder: true, status: true },
        with: { translations: true },
      },
    },
  });

  return rows.flatMap((row) => {
    const text = pickTranslation(row.translations, locale);
    if (!text || row.category.status !== "active") {
      return [];
    }
    const categoryText = pickTranslation(row.category.translations, locale);
    const options = row.options
      .filter((option) => option.status === "active")
      .sort((a, b) => a.displayOrder - b.displayOrder || a.value.localeCompare(b.value))
      .flatMap((option) => {
        const label = pickTranslation(option.translations, locale);
        return label ? [{ value: option.value, label: label.label, locale: label.locale }] : [];
      });

    return [
      {
        slug: row.slug,
        locale: text.locale,
        type: row.questionType,
        prompt: text.prompt,
        description: text.description,
        category: {
          slug: row.category.slug,
          name: categoryText?.name ?? null,
          locale: categoryText?.locale ?? null,
        },
        options,
      },
    ];
  });
}
