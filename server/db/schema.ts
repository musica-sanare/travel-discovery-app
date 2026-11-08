/**
 * D1 schema (Drizzle ORM 0.45). Base tables hold locale-neutral data only;
 * user-visible text lives in `*_translations` tables keyed by (id, locale).
 * See docs/en/DATA_MODEL.md for the logical model and Phase 1 schema notes.
 */
import { relations, sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { COST_PERIODS, COST_SCOPES, SUPPORTED_CURRENCIES } from "../../shared/costs";
import { SUPPORTED_LOCALES } from "../../shared/locales";

export { COST_PERIODS, COST_SCOPES, SUPPORTED_CURRENCIES };

export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export const TAXONOMY_STATUSES = ["active", "archived"] as const;
export const DESTINATION_TYPES = ["city", "region", "island", "other"] as const;
export const QUESTION_TYPES = ["single_choice", "multiple_choice"] as const;

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

const locale = () => text("locale", { enum: SUPPORTED_LOCALES }).notNull();
const localeCheck = (name: string, column: unknown) =>
  check(name, sql`${column} IN (${inList(SUPPORTED_LOCALES)})`);

export const countries = sqliteTable("countries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const countryTranslations = sqliteTable(
  "country_translations",
  {
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text("name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.countryId, t.locale] }),
    localeCheck("country_translations_locale_check", t.locale),
  ],
);

export const attributes = sqliteTable(
  "attributes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    status: text("status", { enum: TAXONOMY_STATUSES }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [check("attributes_status_check", sql`${t.status} IN (${inList(TAXONOMY_STATUSES)})`)],
);

export const attributeTranslations = sqliteTable(
  "attribute_translations",
  {
    attributeId: integer("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => [
    primaryKey({ columns: [t.attributeId, t.locale] }),
    localeCheck("attribute_translations_locale_check", t.locale),
  ],
);

export const questionCategories = sqliteTable(
  "question_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    status: text("status", { enum: TAXONOMY_STATUSES }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    check("question_categories_status_check", sql`${t.status} IN (${inList(TAXONOMY_STATUSES)})`),
  ],
);

export const questionCategoryTranslations = sqliteTable(
  "question_category_translations",
  {
    categoryId: integer("category_id")
      .notNull()
      .references(() => questionCategories.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text("name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.categoryId, t.locale] }),
    localeCheck("question_category_translations_locale_check", t.locale),
  ],
);

export const destinations = sqliteTable(
  "destinations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    destinationType: text("destination_type", { enum: DESTINATION_TYPES }).notNull(),
    recommendedDaysMin: integer("recommended_days_min"),
    recommendedDaysMax: integer("recommended_days_max"),
    // Best travel months as a 12-bit mask (bit m - 1 = month m); NULL = unknown.
    bestMonthsMask: integer("best_months_mask"),
    // Representative point in WGS 84 degrees (DATA_MODEL.md); both or neither,
    // validated by the admin API rather than a CHECK so the column can be added in place.
    latitude: real("latitude"),
    longitude: real("longitude"),
    imageUrl: text("image_url"),
    imageAttribution: text("image_attribution"),
    status: text("status", { enum: CONTENT_STATUSES }).notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("destinations_status_idx").on(t.status),
    index("destinations_country_idx").on(t.countryId),
    check("destinations_status_check", sql`${t.status} IN (${inList(CONTENT_STATUSES)})`),
    check(
      "destinations_type_check",
      sql`${t.destinationType} IN (${inList(DESTINATION_TYPES)})`,
    ),
    check(
      "destinations_days_check",
      sql`(${t.recommendedDaysMin} IS NULL OR ${t.recommendedDaysMin} >= 1)
        AND (${t.recommendedDaysMax} IS NULL OR ${t.recommendedDaysMax} >= 1)
        AND (${t.recommendedDaysMin} IS NULL OR ${t.recommendedDaysMax} IS NULL
          OR ${t.recommendedDaysMin} <= ${t.recommendedDaysMax})`,
    ),
    check(
      "destinations_best_months_check",
      sql`${t.bestMonthsMask} IS NULL OR ${t.bestMonthsMask} BETWEEN 1 AND 4095`,
    ),
  ],
);

export const destinationTranslations = sqliteTable(
  "destination_translations",
  {
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    locale: locale(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    // JSON array of strings, validated with Zod on write and read.
    highlightsJson: text("highlights_json").notNull().default("[]"),
    cautions: text("cautions"),
    bestSeasonText: text("best_season_text"),
    imageAlt: text("image_alt"),
  },
  (t) => [
    primaryKey({ columns: [t.destinationId, t.locale] }),
    localeCheck("destination_translations_locale_check", t.locale),
  ],
);

/** Indicative cost per destination and currency (docs/working/DECISIONS.md ADR-021). */
export const destinationCostEstimates = sqliteTable(
  "destination_cost_estimates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
    period: text("period", { enum: COST_PERIODS }).notNull(),
    scope: text("scope", { enum: COST_SCOPES }).notNull(),
    // Whole units of `currency`.
    min: integer("min").notNull(),
    max: integer("max").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    // ISO date (YYYY-MM-DD).
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    unique("destination_cost_estimates_destination_currency_unique").on(t.destinationId, t.currency),
    check(
      "destination_cost_estimates_currency_check",
      sql`${t.currency} IN (${inList(SUPPORTED_CURRENCIES)})`,
    ),
    check("destination_cost_estimates_period_check", sql`${t.period} IN (${inList(COST_PERIODS)})`),
    check("destination_cost_estimates_scope_check", sql`${t.scope} IN (${inList(COST_SCOPES)})`),
    check("destination_cost_estimates_range_check", sql`${t.min} >= 0 AND ${t.min} <= ${t.max}`),
  ],
);

export const destinationCostEstimateTranslations = sqliteTable(
  "destination_cost_estimate_translations",
  {
    estimateId: integer("estimate_id")
      .notNull()
      .references(() => destinationCostEstimates.id, { onDelete: "cascade" }),
    locale: locale(),
    basis: text("basis").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.estimateId, t.locale] }),
    localeCheck("destination_cost_estimate_translations_locale_check", t.locale),
  ],
);

export const destinationAttributes = sqliteTable(
  "destination_attributes",
  {
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    attributeId: integer("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "restrict" }),
    score: integer("score").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.destinationId, t.attributeId] }),
    check("destination_attributes_score_check", sql`${t.score} BETWEEN 0 AND 5`),
  ],
);

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => questionCategories.id, { onDelete: "restrict" }),
    questionType: text("question_type", { enum: QUESTION_TYPES }).notNull(),
    priorityWeight: integer("priority_weight").notNull().default(5),
    displayOrder: integer("display_order"),
    status: text("status", { enum: CONTENT_STATUSES }).notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("questions_status_idx").on(t.status),
    index("questions_category_idx").on(t.categoryId),
    check("questions_status_check", sql`${t.status} IN (${inList(CONTENT_STATUSES)})`),
    check("questions_type_check", sql`${t.questionType} IN (${inList(QUESTION_TYPES)})`),
    check("questions_priority_check", sql`${t.priorityWeight} BETWEEN 1 AND 10`),
  ],
);

export const questionTranslations = sqliteTable(
  "question_translations",
  {
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    locale: locale(),
    prompt: text("prompt").notNull(),
    description: text("description"),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.locale] }),
    localeCheck("question_translations_locale_check", t.locale),
  ],
);

export const questionOptions = sqliteTable(
  "question_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    status: text("status", { enum: TAXONOMY_STATUSES }).notNull().default("active"),
  },
  (t) => [
    index("question_options_question_idx").on(t.questionId),
    unique("question_options_question_value_unique").on(t.questionId, t.value),
    check("question_options_status_check", sql`${t.status} IN (${inList(TAXONOMY_STATUSES)})`),
  ],
);

export const questionOptionTranslations = sqliteTable(
  "question_option_translations",
  {
    optionId: integer("option_id")
      .notNull()
      .references(() => questionOptions.id, { onDelete: "cascade" }),
    locale: locale(),
    label: text("label").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.optionId, t.locale] }),
    localeCheck("question_option_translations_locale_check", t.locale),
  ],
);

export const optionScoreEffects = sqliteTable(
  "option_score_effects",
  {
    optionId: integer("option_id")
      .notNull()
      .references(() => questionOptions.id, { onDelete: "cascade" }),
    attributeId: integer("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "restrict" }),
    weight: integer("weight").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.optionId, t.attributeId] }),
    check("option_score_effects_weight_check", sql`${t.weight} BETWEEN -5 AND 5 AND ${t.weight} <> 0`),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const countriesRelations = relations(countries, ({ many }) => ({
  translations: many(countryTranslations),
  destinations: many(destinations),
}));

export const countryTranslationsRelations = relations(countryTranslations, ({ one }) => ({
  country: one(countries, { fields: [countryTranslations.countryId], references: [countries.id] }),
}));

export const attributesRelations = relations(attributes, ({ many }) => ({
  translations: many(attributeTranslations),
}));

export const attributeTranslationsRelations = relations(attributeTranslations, ({ one }) => ({
  attribute: one(attributes, {
    fields: [attributeTranslations.attributeId],
    references: [attributes.id],
  }),
}));

export const questionCategoriesRelations = relations(questionCategories, ({ many }) => ({
  translations: many(questionCategoryTranslations),
  questions: many(questions),
}));

export const questionCategoryTranslationsRelations = relations(
  questionCategoryTranslations,
  ({ one }) => ({
    category: one(questionCategories, {
      fields: [questionCategoryTranslations.categoryId],
      references: [questionCategories.id],
    }),
  }),
);

export const destinationsRelations = relations(destinations, ({ one, many }) => ({
  country: one(countries, { fields: [destinations.countryId], references: [countries.id] }),
  translations: many(destinationTranslations),
  attributeScores: many(destinationAttributes),
  costEstimates: many(destinationCostEstimates),
}));

export const destinationCostEstimatesRelations = relations(
  destinationCostEstimates,
  ({ one, many }) => ({
    destination: one(destinations, {
      fields: [destinationCostEstimates.destinationId],
      references: [destinations.id],
    }),
    translations: many(destinationCostEstimateTranslations),
  }),
);

export const destinationCostEstimateTranslationsRelations = relations(
  destinationCostEstimateTranslations,
  ({ one }) => ({
    estimate: one(destinationCostEstimates, {
      fields: [destinationCostEstimateTranslations.estimateId],
      references: [destinationCostEstimates.id],
    }),
  }),
);

export const destinationTranslationsRelations = relations(destinationTranslations, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationTranslations.destinationId],
    references: [destinations.id],
  }),
}));

export const destinationAttributesRelations = relations(destinationAttributes, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationAttributes.destinationId],
    references: [destinations.id],
  }),
  attribute: one(attributes, {
    fields: [destinationAttributes.attributeId],
    references: [attributes.id],
  }),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  category: one(questionCategories, {
    fields: [questions.categoryId],
    references: [questionCategories.id],
  }),
  translations: many(questionTranslations),
  options: many(questionOptions),
}));

export const questionTranslationsRelations = relations(questionTranslations, ({ one }) => ({
  question: one(questions, { fields: [questionTranslations.questionId], references: [questions.id] }),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one, many }) => ({
  question: one(questions, { fields: [questionOptions.questionId], references: [questions.id] }),
  translations: many(questionOptionTranslations),
  effects: many(optionScoreEffects),
}));

export const questionOptionTranslationsRelations = relations(
  questionOptionTranslations,
  ({ one }) => ({
    option: one(questionOptions, {
      fields: [questionOptionTranslations.optionId],
      references: [questionOptions.id],
    }),
  }),
);

export const optionScoreEffectsRelations = relations(optionScoreEffects, ({ one }) => ({
  option: one(questionOptions, {
    fields: [optionScoreEffects.optionId],
    references: [questionOptions.id],
  }),
  attribute: one(attributes, {
    fields: [optionScoreEffects.attributeId],
    references: [attributes.id],
  }),
}));
