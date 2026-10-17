/**
 * Admin write operations. Each aggregate (base row + translations + child
 * rows) is written in a single D1 batch, which D1 executes atomically. New rows
 * are referenced by slug sub-selects so a create needs no intermediate reads.
 *
 * This module is admin-only: the public Worker must never import it
 * (enforced by ESLint and worker/boundary.test.ts).
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { SUPPORTED_LOCALES, type Locale } from "../../shared/locales";
import { monthsToMask } from "../../shared/months";
import type { Database } from "../db/client";
import {
  appSettings,
  attributes,
  attributeTranslations,
  countries,
  countryTranslations,
  destinationAttributes,
  destinationCostEstimates,
  destinationCostEstimateTranslations,
  destinations,
  destinationTranslations,
  optionScoreEffects,
  questionCategories,
  questionCategoryTranslations,
  questionOptions,
  questionOptionTranslations,
  questions,
  questionTranslations,
} from "../db/schema";
import { ApiError } from "../http/errors";
import { SETTINGS_KEYS, type SettingsInput } from "./settings";
import type {
  AttributeInput,
  CategoryInput,
  CountryInput,
  DestinationInput,
  QuestionInput,
} from "./validation";

type Statement = BatchItem<"sqlite">;

async function runBatch(db: Database, statements: Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

function now(): string {
  return new Date().toISOString();
}

function entries<T>(map: Partial<Record<Locale, T | undefined>>): [Locale, T][] {
  return SUPPORTED_LOCALES.flatMap((locale) => {
    const value = map[locale];
    return value === undefined ? [] : [[locale, value] as [Locale, T]];
  });
}

/** Throws 404 unless a row with `id` exists in `table`. */
async function assertExists(
  db: Database,
  table: typeof countries | typeof attributes | typeof questionCategories | typeof destinations | typeof questions,
  id: number,
): Promise<void> {
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) {
    throw new ApiError("not_found");
  }
}

async function idBySlug(
  db: Database,
  table: typeof countries | typeof attributes | typeof questionCategories | typeof destinations | typeof questions,
  slug: string,
): Promise<number> {
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
  if (!row) {
    throw new Error("Row missing after successful batch insert");
  }
  return row.id;
}

// Countries ------------------------------------------------------------------

function countryTranslationRows(countryId: number | ReturnType<typeof sql>, input: CountryInput) {
  return entries(input.translations).map(([locale, t]) => ({ countryId, locale, name: t.name }));
}

export async function createCountry(db: Database, input: CountryInput): Promise<number> {
  const timestamp = now();
  const ref = sql`(SELECT id FROM countries WHERE slug = ${input.slug})`;
  await runBatch(db, [
    db.insert(countries).values({ slug: input.slug, createdAt: timestamp, updatedAt: timestamp }),
    db.insert(countryTranslations).values(countryTranslationRows(ref, input)),
  ]);
  return idBySlug(db, countries, input.slug);
}

export async function updateCountry(db: Database, id: number, input: CountryInput): Promise<void> {
  await assertExists(db, countries, id);
  await runBatch(db, [
    db.update(countries).set({ slug: input.slug, updatedAt: now() }).where(eq(countries.id, id)),
    db.delete(countryTranslations).where(eq(countryTranslations.countryId, id)),
    db.insert(countryTranslations).values(countryTranslationRows(id, input)),
  ]);
}

// Attributes -----------------------------------------------------------------

function attributeTranslationRows(attributeId: number | ReturnType<typeof sql>, input: AttributeInput) {
  return entries(input.translations).map(([locale, t]) => ({
    attributeId,
    locale,
    name: t.name,
    description: t.description,
  }));
}

export async function createAttribute(db: Database, input: AttributeInput): Promise<number> {
  const timestamp = now();
  const ref = sql`(SELECT id FROM attributes WHERE slug = ${input.slug})`;
  await runBatch(db, [
    db.insert(attributes).values({
      slug: input.slug,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    db.insert(attributeTranslations).values(attributeTranslationRows(ref, input)),
  ]);
  return idBySlug(db, attributes, input.slug);
}

export async function updateAttribute(db: Database, id: number, input: AttributeInput): Promise<void> {
  await assertExists(db, attributes, id);
  await runBatch(db, [
    db
      .update(attributes)
      .set({ slug: input.slug, status: input.status, updatedAt: now() })
      .where(eq(attributes.id, id)),
    db.delete(attributeTranslations).where(eq(attributeTranslations.attributeId, id)),
    db.insert(attributeTranslations).values(attributeTranslationRows(id, input)),
  ]);
}

// Question categories --------------------------------------------------------

function categoryTranslationRows(categoryId: number | ReturnType<typeof sql>, input: CategoryInput) {
  return entries(input.translations).map(([locale, t]) => ({ categoryId, locale, name: t.name }));
}

export async function createCategory(db: Database, input: CategoryInput): Promise<number> {
  const timestamp = now();
  const ref = sql`(SELECT id FROM question_categories WHERE slug = ${input.slug})`;
  await runBatch(db, [
    db.insert(questionCategories).values({
      slug: input.slug,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    db.insert(questionCategoryTranslations).values(categoryTranslationRows(ref, input)),
  ]);
  return idBySlug(db, questionCategories, input.slug);
}

export async function updateCategory(db: Database, id: number, input: CategoryInput): Promise<void> {
  await assertExists(db, questionCategories, id);
  await runBatch(db, [
    db
      .update(questionCategories)
      .set({ slug: input.slug, status: input.status, updatedAt: now() })
      .where(eq(questionCategories.id, id)),
    db.delete(questionCategoryTranslations).where(eq(questionCategoryTranslations.categoryId, id)),
    db.insert(questionCategoryTranslations).values(categoryTranslationRows(id, input)),
  ]);
}

// Destinations ---------------------------------------------------------------

function destinationColumns(input: DestinationInput) {
  return {
    slug: input.slug,
    countryId: input.countryId,
    destinationType: input.type,
    status: input.status,
    recommendedDaysMin: input.recommendedDays.min,
    recommendedDaysMax: input.recommendedDays.max,
    bestMonthsMask: monthsToMask(input.bestMonths),
    imageUrl: input.image?.url ?? null,
    imageAttribution: input.image?.attribution ?? null,
  };
}

function destinationChildStatements(
  db: Database,
  destinationId: number | ReturnType<typeof sql>,
  input: DestinationInput,
): Statement[] {
  const statements: Statement[] = [
    db.insert(destinationTranslations).values(
      entries(input.translations).map(([locale, t]) => ({
        destinationId,
        locale,
        name: t.name,
        summary: t.summary,
        highlightsJson: JSON.stringify(t.highlights),
        cautions: t.cautions,
        bestSeasonText: t.bestSeason,
        imageAlt: t.imageAlt,
      })),
    ),
  ];
  if (input.attributeScores.length > 0) {
    statements.push(
      db.insert(destinationAttributes).values(
        input.attributeScores.map((item) => ({
          destinationId,
          attributeId: item.attributeId,
          score: item.score,
        })),
      ),
    );
  }
  for (const estimate of input.costs) {
    const estimateRef = sql`(SELECT id FROM destination_cost_estimates WHERE destination_id = ${destinationId} AND currency = ${estimate.currency})`;
    statements.push(
      db.insert(destinationCostEstimates).values({
        destinationId,
        currency: estimate.currency,
        period: estimate.period,
        scope: estimate.scope,
        min: estimate.min,
        max: estimate.max,
        sourceName: estimate.sourceName,
        sourceUrl: estimate.sourceUrl,
        updatedAt: estimate.updatedAt,
      }),
    );
    const basisRows = entries(estimate.basis).flatMap(([locale, basis]) =>
      basis ? [{ estimateId: estimateRef, locale, basis }] : [],
    );
    if (basisRows.length > 0) {
      statements.push(db.insert(destinationCostEstimateTranslations).values(basisRows));
    }
  }
  return statements;
}

export async function createDestination(db: Database, input: DestinationInput): Promise<number> {
  const timestamp = now();
  const ref = sql`(SELECT id FROM destinations WHERE slug = ${input.slug})`;
  await runBatch(db, [
    db
      .insert(destinations)
      .values({ ...destinationColumns(input), createdAt: timestamp, updatedAt: timestamp }),
    ...destinationChildStatements(db, ref, input),
  ]);
  return idBySlug(db, destinations, input.slug);
}

export async function updateDestination(
  db: Database,
  id: number,
  input: DestinationInput,
): Promise<void> {
  await assertExists(db, destinations, id);
  await runBatch(db, [
    db
      .update(destinations)
      .set({ ...destinationColumns(input), updatedAt: now() })
      .where(eq(destinations.id, id)),
    db.delete(destinationTranslations).where(eq(destinationTranslations.destinationId, id)),
    db.delete(destinationAttributes).where(eq(destinationAttributes.destinationId, id)),
    // Estimate translations are removed by ON DELETE CASCADE.
    db.delete(destinationCostEstimates).where(eq(destinationCostEstimates.destinationId, id)),
    ...destinationChildStatements(db, id, input),
  ]);
}

// Questions ------------------------------------------------------------------

function questionColumns(input: QuestionInput) {
  return {
    slug: input.slug,
    categoryId: input.categoryId,
    questionType: input.type,
    status: input.status,
    priorityWeight: input.priorityWeight,
    displayOrder: input.displayOrder,
  };
}

/** Statements that write option translations and effects for `input.options`. */
function optionChildStatements(
  db: Database,
  questionRef: number | ReturnType<typeof sql>,
  input: QuestionInput,
): Statement[] {
  const statements: Statement[] = [];
  for (const option of input.options) {
    const optionRef = sql`(SELECT id FROM question_options WHERE question_id = ${questionRef} AND value = ${option.value})`;
    statements.push(
      db.insert(questionOptionTranslations).values(
        entries(option.translations).map(([locale, t]) => ({
          optionId: optionRef,
          locale,
          label: t.label,
        })),
      ),
    );
    if (option.effects.length > 0) {
      statements.push(
        db.insert(optionScoreEffects).values(
          option.effects.map((effect) => ({
            optionId: optionRef,
            attributeId: effect.attributeId,
            weight: effect.weight,
          })),
        ),
      );
    }
  }
  return statements;
}

function questionTranslationRows(questionId: number | ReturnType<typeof sql>, input: QuestionInput) {
  return entries(input.translations).map(([locale, t]) => ({
    questionId,
    locale,
    prompt: t.prompt,
    description: t.description,
  }));
}

export async function createQuestion(db: Database, input: QuestionInput): Promise<number> {
  const timestamp = now();
  const ref = sql`(SELECT id FROM questions WHERE slug = ${input.slug})`;
  const statements: Statement[] = [
    db.insert(questions).values({ ...questionColumns(input), createdAt: timestamp, updatedAt: timestamp }),
    db.insert(questionTranslations).values(questionTranslationRows(ref, input)),
  ];
  if (input.options.length > 0) {
    statements.push(
      db.insert(questionOptions).values(
        input.options.map((option) => ({
          questionId: ref,
          value: option.value,
          displayOrder: option.displayOrder,
          status: "active" as const,
        })),
      ),
    );
  }
  statements.push(...optionChildStatements(db, ref, input));
  await runBatch(db, statements);
  return idBySlug(db, questions, input.slug);
}

/**
 * Replaces the question aggregate. Options are matched by their stable
 * `value`: listed options are upserted and reactivated; options omitted from
 * the payload are archived (soft delete), keeping their IDs and translations.
 */
export async function updateQuestion(db: Database, id: number, input: QuestionInput): Promise<void> {
  await assertExists(db, questions, id);
  const values = input.options.map((option) => option.value);
  const listedOptionIds = db
    .select({ id: questionOptions.id })
    .from(questionOptions)
    .where(and(eq(questionOptions.questionId, id), inArray(questionOptions.value, values)));

  const statements: Statement[] = [
    db.update(questions).set({ ...questionColumns(input), updatedAt: now() }).where(eq(questions.id, id)),
    db.delete(questionTranslations).where(eq(questionTranslations.questionId, id)),
    db.insert(questionTranslations).values(questionTranslationRows(id, input)),
    db
      .update(questionOptions)
      .set({ status: "archived" })
      .where(
        values.length > 0
          ? and(eq(questionOptions.questionId, id), notInArray(questionOptions.value, values))
          : eq(questionOptions.questionId, id),
      ),
  ];

  if (values.length > 0) {
    statements.push(
      db
        .insert(questionOptions)
        .values(
          input.options.map((option) => ({
            questionId: id,
            value: option.value,
            displayOrder: option.displayOrder,
            status: "active" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [questionOptions.questionId, questionOptions.value],
          set: { displayOrder: sql`excluded.display_order`, status: "active" },
        }),
      db.delete(questionOptionTranslations).where(inArray(questionOptionTranslations.optionId, listedOptionIds)),
      db.delete(optionScoreEffects).where(inArray(optionScoreEffects.optionId, listedOptionIds)),
      ...optionChildStatements(db, id, input),
    );
  }

  await runBatch(db, statements);
}

// Settings -------------------------------------------------------------------

export async function saveSettings(db: Database, input: SettingsInput): Promise<void> {
  const timestamp = now();
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEYS.quiz, valueJson: JSON.stringify(input.quiz), updatedAt: timestamp })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: JSON.stringify(input.quiz), updatedAt: timestamp },
    });
}
