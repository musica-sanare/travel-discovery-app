/**
 * Admin read queries (all statuses). Used only by the admin Worker.
 */
import { and, asc, eq, exists, or, sql, type SQL } from "drizzle-orm";
import type { Locale } from "../../shared/locales";
import type { Database } from "../db/client";
import {
  appSettings,
  attributes,
  countries,
  destinations,
  destinationTranslations,
  questionCategories,
  questions,
  questionTranslations,
  type CONTENT_STATUSES,
} from "../db/schema";
import { parseStoredQuizSettings, SETTINGS_KEYS } from "./settings";

export const ADMIN_PAGE_SIZE = 50;

type Translated<T> = Partial<Record<Locale, T>>;

function toTranslationMap<T extends { locale: Locale }, R>(
  rows: readonly T[],
  pick: (row: T) => R,
): Translated<R> {
  const map: Translated<R> = {};
  for (const row of rows) {
    map[row.locale] = pick(row);
  }
  return map;
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export interface ListFilter {
  q?: string | undefined;
  status?: (typeof CONTENT_STATUSES)[number] | undefined;
  categoryId?: number | undefined;
  page: number;
}

function page<T>(rows: T[], current: number) {
  return {
    items: rows.slice(0, ADMIN_PAGE_SIZE),
    page: current,
    hasMore: rows.length > ADMIN_PAGE_SIZE,
  };
}

export async function listCountries(db: Database) {
  const rows = await db.query.countries.findMany({
    orderBy: asc(countries.slug),
    with: { translations: true },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    updatedAt: row.updatedAt,
    translations: toTranslationMap(row.translations, (t) => ({ name: t.name })),
  }));
}

export async function listAttributes(db: Database) {
  const rows = await db.query.attributes.findMany({
    orderBy: asc(attributes.slug),
    with: { translations: true },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updatedAt,
    translations: toTranslationMap(row.translations, (t) => ({
      name: t.name,
      description: t.description,
    })),
  }));
}

export async function listCategories(db: Database) {
  const rows = await db.query.questionCategories.findMany({
    orderBy: asc(questionCategories.slug),
    with: { translations: true },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updatedAt,
    translations: toTranslationMap(row.translations, (t) => ({ name: t.name })),
  }));
}

export async function listDestinations(db: Database, filter: ListFilter) {
  const conditions: SQL[] = [];
  if (filter.status) {
    conditions.push(eq(destinations.status, filter.status));
  }
  if (filter.q) {
    const pattern = likePattern(filter.q);
    const nameMatch = exists(
      db
        .select({ one: sql`1` })
        .from(destinationTranslations)
        .where(
          and(
            eq(destinationTranslations.destinationId, destinations.id),
            sql`${destinationTranslations.name} LIKE ${pattern} ESCAPE '\\'`,
          ),
        ),
    );
    const slugMatch = sql`${destinations.slug} LIKE ${pattern} ESCAPE '\\'`;
    const match = or(slugMatch, nameMatch);
    if (match) {
      conditions.push(match);
    }
  }

  const rows = await db.query.destinations.findMany({
    columns: { id: true, slug: true, status: true, destinationType: true, updatedAt: true },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: asc(destinations.slug),
    limit: ADMIN_PAGE_SIZE + 1,
    offset: (filter.page - 1) * ADMIN_PAGE_SIZE,
    with: { translations: { columns: { locale: true, name: true } } },
  });

  return page(
    rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
      type: row.destinationType,
      updatedAt: row.updatedAt,
      names: toTranslationMap(row.translations, (t) => t.name),
    })),
    filter.page,
  );
}

export async function getDestination(db: Database, id: number) {
  const row = await db.query.destinations.findFirst({
    where: eq(destinations.id, id),
    with: { translations: true, attributeScores: true },
  });
  if (!row) {
    return undefined;
  }
  const hasCost =
    row.costMin !== null &&
    row.costMax !== null &&
    row.costCurrency !== null &&
    row.costScope !== null &&
    row.costSourceName !== null &&
    row.costUpdatedAt !== null;

  return {
    id: row.id,
    slug: row.slug,
    countryId: row.countryId,
    type: row.destinationType,
    status: row.status,
    recommendedDays: { min: row.recommendedDaysMin, max: row.recommendedDaysMax },
    cost: hasCost
      ? {
          min: row.costMin,
          max: row.costMax,
          currency: row.costCurrency,
          scope: row.costScope,
          sourceName: row.costSourceName,
          sourceUrl: row.costSourceUrl,
          updatedAt: row.costUpdatedAt,
        }
      : null,
    image: row.imageUrl ? { url: row.imageUrl, attribution: row.imageAttribution } : null,
    translations: toTranslationMap(row.translations, (t) => ({
      name: t.name,
      summary: t.summary,
      highlights: safeStringArray(t.highlightsJson),
      cautions: t.cautions,
      bestSeason: t.bestSeasonText,
      costBasis: t.costBasis,
      imageAlt: t.imageAlt,
    })),
    attributeScores: row.attributeScores.map((score) => ({
      attributeId: score.attributeId,
      score: score.score,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeStringArray(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function listQuestions(db: Database, filter: ListFilter) {
  const conditions: SQL[] = [];
  if (filter.status) {
    conditions.push(eq(questions.status, filter.status));
  }
  if (filter.categoryId) {
    conditions.push(eq(questions.categoryId, filter.categoryId));
  }
  if (filter.q) {
    const pattern = likePattern(filter.q);
    const promptMatch = exists(
      db
        .select({ one: sql`1` })
        .from(questionTranslations)
        .where(
          and(
            eq(questionTranslations.questionId, questions.id),
            sql`${questionTranslations.prompt} LIKE ${pattern} ESCAPE '\\'`,
          ),
        ),
    );
    const match = or(sql`${questions.slug} LIKE ${pattern} ESCAPE '\\'`, promptMatch);
    if (match) {
      conditions.push(match);
    }
  }

  const rows = await db.query.questions.findMany({
    columns: { id: true, slug: true, status: true, categoryId: true, updatedAt: true },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [asc(questions.displayOrder), asc(questions.slug)],
    limit: ADMIN_PAGE_SIZE + 1,
    offset: (filter.page - 1) * ADMIN_PAGE_SIZE,
    with: { translations: { columns: { locale: true, prompt: true } } },
  });

  return page(
    rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
      categoryId: row.categoryId,
      updatedAt: row.updatedAt,
      prompts: toTranslationMap(row.translations, (t) => t.prompt),
    })),
    filter.page,
  );
}

export async function getQuestion(db: Database, id: number) {
  const row = await db.query.questions.findFirst({
    where: eq(questions.id, id),
    with: {
      translations: true,
      options: { with: { translations: true, effects: true } },
    },
  });
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    slug: row.slug,
    categoryId: row.categoryId,
    type: row.questionType,
    status: row.status,
    priorityWeight: row.priorityWeight,
    displayOrder: row.displayOrder,
    translations: toTranslationMap(row.translations, (t) => ({
      prompt: t.prompt,
      description: t.description,
    })),
    options: row.options
      .sort((a, b) => a.displayOrder - b.displayOrder || a.value.localeCompare(b.value))
      .map((option) => ({
        id: option.id,
        value: option.value,
        displayOrder: option.displayOrder,
        status: option.status,
        translations: toTranslationMap(option.translations, (t) => ({ label: t.label })),
        effects: option.effects.map((effect) => ({
          attributeId: effect.attributeId,
          weight: effect.weight,
        })),
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getSettings(db: Database) {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, SETTINGS_KEYS.quiz),
  });
  return { quiz: parseStoredQuizSettings(row?.valueJson) };
}
