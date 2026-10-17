/**
 * Runtime validation for admin API payloads. Rules that depend on publication
 * status (e.g. a base-locale translation) are enforced here so the API rejects
 * unpublishable content with field-level issues.
 */
import { z } from "zod";
import { COST_PERIODS, COST_SCOPES, SUPPORTED_CURRENCIES } from "../../shared/costs";
import { PUBLISHABLE_BASE_LOCALES, SUPPORTED_LOCALES, type Locale } from "../../shared/locales";
import { MONTHS } from "../../shared/months";
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from "../../shared/slug";
import {
  CONTENT_STATUSES,
  DESTINATION_TYPES,
  QUESTION_TYPES,
  TAXONOMY_STATUSES,
} from "../db/schema";

const slug = z.string().max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN);

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const httpsUrl = z
  .url({ protocol: /^https$/ })
  .max(2048);

const id = z.number().int().positive();

/** Translations keyed by locale; at least one locale must be present. */
function translations<T extends z.ZodType>(entry: T) {
  return z
    .object({ ja: entry.optional(), en: entry.optional(), es: entry.optional() })
    .refine((value) => Object.values(value).some((item) => item !== undefined), {
      message: "at_least_one_translation",
    });
}

type TranslationMap = Partial<Record<Locale, unknown>>;

function hasBaseLocale(map: TranslationMap): boolean {
  return PUBLISHABLE_BASE_LOCALES.some((locale) => map[locale] !== undefined);
}

/** Adds an issue unless a `ja` or `en` translation exists (ADR-012). */
function requireBaseLocale(map: TranslationMap, ctx: z.RefinementCtx, path: (string | number)[]) {
  if (!hasBaseLocale(map)) {
    ctx.addIssue({ code: "custom", message: "base_locale_required", path });
  }
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => unknown): boolean {
  return new Set(items.map(key)).size === items.length;
}

const nameTranslation = z.object({ name: requiredText(120) });

export const countryInput = z
  .object({ slug, translations: translations(nameTranslation) })
  .superRefine((value, ctx) => {
    requireBaseLocale(value.translations, ctx, ["translations"]);
  });

export const attributeInput = z
  .object({
    slug,
    status: z.enum(TAXONOMY_STATUSES),
    translations: translations(
      z.object({ name: requiredText(120), description: optionalText(1000) }),
    ),
  })
  .superRefine((value, ctx) => {
    requireBaseLocale(value.translations, ctx, ["translations"]);
  });

export const categoryInput = z
  .object({
    slug,
    status: z.enum(TAXONOMY_STATUSES),
    translations: translations(nameTranslation),
  })
  .superRefine((value, ctx) => {
    requireBaseLocale(value.translations, ctx, ["translations"]);
  });

const costEstimateInput = z
  .object({
    currency: z.enum(SUPPORTED_CURRENCIES),
    period: z.enum(COST_PERIODS),
    scope: z.enum(COST_SCOPES),
    min: z.number().int().min(0).max(100_000_000),
    max: z.number().int().min(0).max(100_000_000),
    sourceName: requiredText(200),
    sourceUrl: httpsUrl.nullish().transform((value) => value ?? null),
    updatedAt: z.iso.date(),
    basis: z.object({
      ja: optionalText(1000).optional(),
      en: optionalText(1000).optional(),
      es: optionalText(1000).optional(),
    }),
  })
  .refine((value) => value.min <= value.max, { message: "min_exceeds_max", path: ["min"] });

const bestMonths = z
  .array(z.number().int().min(1).max(12))
  .max(MONTHS.length)
  .refine((items) => uniqueBy(items, (item) => item), { message: "duplicate_month" });

const destinationTranslation = z.object({
  name: requiredText(120),
  summary: requiredText(1000),
  highlights: z.array(requiredText(200)).max(8).default([]),
  cautions: optionalText(1000),
  bestSeason: optionalText(300),
  imageAlt: optionalText(300),
});

const days = z.number().int().min(1).max(365).nullable();

export const destinationInput = z
  .object({
    slug,
    countryId: id,
    type: z.enum(DESTINATION_TYPES),
    status: z.enum(CONTENT_STATUSES),
    recommendedDays: z.object({ min: days, max: days }),
    bestMonths: bestMonths.default([]),
    costs: z
      .array(costEstimateInput)
      .max(SUPPORTED_CURRENCIES.length)
      .default([])
      .refine((items) => uniqueBy(items, (item) => item.currency), {
        message: "duplicate_currency",
      }),
    image: z.object({ url: httpsUrl, attribution: requiredText(300) }).nullable(),
    translations: translations(destinationTranslation),
    attributeScores: z
      .array(z.object({ attributeId: id, score: z.number().int().min(0).max(5) }))
      .max(100)
      .refine((items) => uniqueBy(items, (item) => item.attributeId), {
        message: "duplicate_attribute",
      }),
  })
  .superRefine((value, ctx) => {
    const { min, max } = value.recommendedDays;
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({ code: "custom", message: "min_exceeds_max", path: ["recommendedDays", "min"] });
    }
    if (value.status === "published") {
      requireBaseLocale(value.translations, ctx, ["translations"]);
    }
    // Every estimate needs a basis in each locale the destination is translated into.
    value.costs.forEach((estimate, index) => {
      for (const locale of SUPPORTED_LOCALES) {
        if (value.translations[locale] && !estimate.basis[locale]) {
          ctx.addIssue({
            code: "custom",
            message: "cost_basis_required",
            path: ["costs", index, "basis", locale],
          });
        }
      }
    });
    if (value.image !== null) {
      for (const [locale, text] of Object.entries(value.translations)) {
        if (text && !text.imageAlt) {
          ctx.addIssue({
            code: "custom",
            message: "image_alt_required",
            path: ["translations", locale, "imageAlt"],
          });
        }
      }
    }
  });

const optionInput = z.object({
  value: slug,
  displayOrder: z.number().int().min(0).max(1000),
  translations: translations(z.object({ label: requiredText(120) })),
  effects: z
    .array(
      z.object({
        attributeId: id,
        weight: z.number().int().min(-5).max(5).refine((weight) => weight !== 0, "zero_weight"),
      }),
    )
    .max(50)
    .refine((items) => uniqueBy(items, (item) => item.attributeId), {
      message: "duplicate_attribute",
    }),
});

export const questionInput = z
  .object({
    slug,
    categoryId: id,
    type: z.enum(QUESTION_TYPES),
    status: z.enum(CONTENT_STATUSES),
    priorityWeight: z.number().int().min(1).max(10),
    displayOrder: z.number().int().min(0).max(10_000).nullable(),
    translations: translations(
      z.object({ prompt: requiredText(300), description: optionalText(1000) }),
    ),
    options: z
      .array(optionInput)
      .max(20)
      .refine((items) => uniqueBy(items, (item) => item.value), { message: "duplicate_value" }),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "published") {
      return;
    }
    requireBaseLocale(value.translations, ctx, ["translations"]);
    if (value.options.length < 2) {
      ctx.addIssue({ code: "custom", message: "min_two_options", path: ["options"] });
    }
    value.options.forEach((option, index) => {
      requireBaseLocale(option.translations, ctx, ["options", index, "translations"]);
    });
  });

export type CountryInput = z.infer<typeof countryInput>;
export type AttributeInput = z.infer<typeof attributeInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type DestinationInput = z.infer<typeof destinationInput>;
export type QuestionInput = z.infer<typeof questionInput>;
