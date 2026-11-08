/**
 * Contract of `GET /api/diagnosis-content` (docs/working/DECISIONS.md ADR-022). The
 * server builds this shape; the browser validates responses against it before
 * running the diagnostic engine. Uses `zod/mini` to keep the public bundle
 * small (ADR-023).
 */
import * as z from "zod/mini";
import { COST_PERIODS, COST_SCOPES, SUPPORTED_CURRENCIES } from "./costs";
import { SUPPORTED_LOCALES } from "./locales";
import { quizSettingsSchema } from "./quiz-settings";

const locale = z.enum(SUPPORTED_LOCALES);
const slug = z.string().check(z.minLength(1), z.maxLength(100));
const int = (min: number, max?: number) =>
  max === undefined ? z.number().check(z.int(), z.gte(min)) : z.number().check(z.int(), z.gte(min), z.lte(max));

const attribute = z.object({ slug, name: z.string(), locale });

const option = z.object({
  value: slug,
  label: z.string(),
  locale,
  effects: z.array(z.object({ attribute: slug, weight: int(-5, 5) })),
});

const question = z.object({
  slug,
  type: z.enum(["single_choice", "multiple_choice"]),
  priorityWeight: int(1, 10),
  prompt: z.string(),
  description: z.nullable(z.string()),
  locale,
  category: z.object({ slug, name: z.nullable(z.string()), locale: z.nullable(locale) }),
  options: z.array(option),
});

const costEstimate = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  period: z.enum(COST_PERIODS),
  scope: z.enum(COST_SCOPES),
  min: int(0),
  max: int(0),
  basis: z.nullable(z.string()),
  basisLocale: z.nullable(locale),
  sourceName: z.string(),
  sourceUrl: z.nullable(z.string()),
  updatedAt: z.string(),
});

const days = z.nullable(int(1));

const destination = z.object({
  slug,
  locale,
  type: z.enum(["city", "region", "island", "other"]),
  name: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  cautions: z.nullable(z.string()),
  bestSeason: z.nullable(z.string()),
  recommendedDays: z.object({ min: days, max: days }),
  bestMonths: z.nullable(z.array(int(1, 12))),
  location: z.nullable(
    z.object({
      latitude: z.number().check(z.gte(-90), z.lte(90)),
      longitude: z.number().check(z.gte(-180), z.lte(180)),
    }),
  ),
  country: z.object({ slug, name: z.nullable(z.string()), locale: z.nullable(locale) }),
  costs: z.array(costEstimate),
  image: z.nullable(z.object({ url: z.string(), alt: z.nullable(z.string()), attribution: z.nullable(z.string()) })),
  attributeScores: z.array(z.object({ attribute: slug, score: int(0, 5) })),
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
