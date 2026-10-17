/**
 * Contract of `GET /api/diagnosis-content` (docs/DECISIONS.md ADR-022). The
 * server builds this shape; the browser validates responses against it before
 * running the diagnostic engine.
 */
import { z } from "zod";
import { COST_PERIODS, COST_SCOPES, SUPPORTED_CURRENCIES } from "./costs";
import { SUPPORTED_LOCALES } from "./locales";
import { quizSettingsSchema } from "./quiz-settings";

const locale = z.enum(SUPPORTED_LOCALES);
const slug = z.string().min(1).max(100);

const attribute = z.object({ slug, name: z.string(), locale });

const option = z.object({
  value: slug,
  label: z.string(),
  locale,
  effects: z.array(z.object({ attribute: slug, weight: z.number().int().min(-5).max(5) })),
});

const question = z.object({
  slug,
  type: z.enum(["single_choice", "multiple_choice"]),
  priorityWeight: z.number().int().min(1).max(10),
  prompt: z.string(),
  description: z.string().nullable(),
  locale,
  category: z.object({ slug, name: z.string().nullable(), locale: locale.nullable() }),
  options: z.array(option),
});

const costEstimate = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  period: z.enum(COST_PERIODS),
  scope: z.enum(COST_SCOPES),
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  basis: z.string().nullable(),
  basisLocale: locale.nullable(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  updatedAt: z.string(),
});

const days = z.number().int().min(1).nullable();

const destination = z.object({
  slug,
  locale,
  type: z.enum(["city", "region", "island", "other"]),
  name: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  cautions: z.string().nullable(),
  bestSeason: z.string().nullable(),
  recommendedDays: z.object({ min: days, max: days }),
  bestMonths: z.array(z.number().int().min(1).max(12)).nullable(),
  country: z.object({ slug, name: z.string().nullable(), locale: locale.nullable() }),
  costs: z.array(costEstimate),
  image: z.object({ url: z.string(), alt: z.string().nullable(), attribution: z.string().nullable() }).nullable(),
  attributeScores: z.array(z.object({ attribute: slug, score: z.number().int().min(0).max(5) })),
});

export const diagnosisContentSchema = z.object({
  locale,
  settings: quizSettingsSchema,
  attributes: z.array(attribute),
  questions: z.array(question),
  destinations: z.array(destination),
});

export type DiagnosisContentResponse = z.infer<typeof diagnosisContentSchema>;
export type DiagnosisContentQuestion = DiagnosisContentResponse["questions"][number];
export type DiagnosisContentDestination = DiagnosisContentResponse["destinations"][number];
