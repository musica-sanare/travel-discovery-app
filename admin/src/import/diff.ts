/**
 * Field-level differences between a bundle item and the stored one, for the
 * opt-in update mode of the Import page (ADR-028). Both sides are brought into
 * one comparable shape with slug references, applying the same defaults and
 * trimming as the admin API validation, so that an item imported unchanged
 * compares equal to the file it came from.
 */
import { SUPPORTED_LOCALES } from "../../../shared/locales";
import { SUPPORTED_CURRENCIES, type DestinationDetail, type QuestionDetail } from "../types";

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function requiredText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

/** Mirrors `optionalText`: trimmed, and empty or missing becomes null. */
function optionalText(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

/** Slug of a stored ID; an unknown ID stays visible in the diff. */
export type SlugMaps = Record<"countries" | "attributes" | "categories", ReadonlyMap<number, string>>;

function slugOf(map: ReadonlyMap<number, string>, id: number): string {
  return map.get(id) ?? `#${String(id)}`;
}

function byLocale(value: unknown, shape: (entry: Json) => Json): Json {
  const source = isObject(value) ? value : {};
  const result: Json = {};
  for (const locale of SUPPORTED_LOCALES) {
    const entry = source[locale];
    if (isObject(entry)) result[locale] = shape(entry);
  }
  return result;
}

function destinationTranslationsOf(value: unknown): Json {
  return byLocale(value, (entry) => ({
    name: requiredText(entry.name),
    summary: requiredText(entry.summary),
    highlights: list(entry.highlights).map(requiredText),
    cautions: optionalText(entry.cautions),
    bestSeason: optionalText(entry.bestSeason),
    imageAlt: optionalText(entry.imageAlt),
  }));
}

/** Stored bases exist only for non-empty texts, so empty ones are dropped. */
function basisOf(value: unknown): Json {
  const source = isObject(value) ? value : {};
  const result: Json = {};
  for (const locale of SUPPORTED_LOCALES) {
    const text = optionalText(source[locale]);
    if (text !== null) result[locale] = text;
  }
  return result;
}

function costsOf(value: unknown): Json {
  const result: Json = {};
  const byCurrency = new Map(list(value).filter(isObject).map((cost) => [cost.currency, cost]));
  const currencies = [
    ...SUPPORTED_CURRENCIES.filter((currency) => byCurrency.has(currency)),
    ...[...byCurrency.keys()].filter((currency) => !(SUPPORTED_CURRENCIES as readonly unknown[]).includes(currency)),
  ];
  for (const currency of currencies) {
    const cost = byCurrency.get(currency) ?? {};
    result[String(currency)] = {
      period: cost.period,
      scope: cost.scope,
      min: cost.min,
      max: cost.max,
      sourceName: requiredText(cost.sourceName),
      sourceUrl: cost.sourceUrl ?? null,
      updatedAt: cost.updatedAt,
      basis: basisOf(cost.basis),
    };
  }
  return result;
}

/** Attribute slug → value, sorted by slug (attribute scores and option effects). */
function byAttribute(items: readonly { attribute: unknown; value: unknown }[]): Json {
  const result: Json = {};
  for (const { attribute, value } of [...items].sort((a, b) => String(a.attribute).localeCompare(String(b.attribute)))) {
    result[String(attribute)] = value;
  }
  return result;
}

function monthsOf(value: unknown): unknown[] {
  return [...list(value)].sort((a, b) => Number(a) - Number(b));
}

function imageOf(value: unknown): unknown {
  if (!isObject(value)) return value ?? null;
  return { url: value.url, attribution: requiredText(value.attribution) };
}

/** The comparable shape of a destination as written in a bundle (slug references). */
export function destinationFromBundle(data: Json): Json {
  const days = isObject(data.recommendedDays) ? data.recommendedDays : {};
  return {
    country: data.country,
    type: data.type,
    status: data.status,
    recommendedDays: { min: days.min ?? null, max: days.max ?? null },
    bestMonths: monthsOf(data.bestMonths),
    costs: costsOf(data.costs),
    image: imageOf(data.image),
    translations: destinationTranslationsOf(data.translations),
    attributeScores: byAttribute(
      list(data.attributeScores)
        .filter(isObject)
        .map((score) => ({ attribute: score.attribute, value: score.score })),
    ),
  };
}

/** The comparable shape of a stored destination; IDs are turned back into slugs. */
export function destinationFromStored(item: DestinationDetail, slugs: SlugMaps): Json {
  return {
    country: slugOf(slugs.countries, item.countryId),
    type: item.type,
    status: item.status,
    recommendedDays: { min: item.recommendedDays.min, max: item.recommendedDays.max },
    bestMonths: monthsOf(item.bestMonths),
    costs: costsOf(item.costs),
    image: imageOf(item.image),
    translations: destinationTranslationsOf(item.translations),
    attributeScores: byAttribute(
      item.attributeScores.map((score) => ({ attribute: slugOf(slugs.attributes, score.attributeId), value: score.score })),
    ),
  };
}

/**
 * The comparable shape of a country, attribute, or category. Bundle entries and
 * stored items share it: countries have no status, and only attributes have a
 * description.
 */
export function taxonomyComparable(
  kind: "countries" | "attributes" | "categories",
  data: { status?: unknown; translations?: unknown },
): Json {
  return {
    ...(kind === "countries" ? {} : { status: data.status }),
    translations: byLocale(data.translations, (entry) => ({
      name: requiredText(entry.name),
      ...(kind === "attributes" ? { description: optionalText(entry.description) } : {}),
    })),
  };
}

interface ComparableOption {
  value: unknown;
  displayOrder: unknown;
  translations: unknown;
  effects: readonly { attribute: unknown; value: unknown }[];
}

/** Options keyed by their stable value, in value order. */
function optionsOf(options: readonly ComparableOption[]): Json {
  const result: Json = {};
  for (const option of [...options].sort((a, b) => String(a.value).localeCompare(String(b.value)))) {
    result[String(option.value)] = {
      displayOrder: option.displayOrder,
      translations: byLocale(option.translations, (entry) => ({ label: requiredText(entry.label) })),
      effects: byAttribute(option.effects),
    };
  }
  return result;
}

function questionTranslationsOf(value: unknown): Json {
  return byLocale(value, (entry) => ({
    prompt: requiredText(entry.prompt),
    description: optionalText(entry.description),
  }));
}

/** The comparable shape of a question as written in a bundle (slug references). */
export function questionFromBundle(data: Json): Json {
  return {
    category: data.category,
    type: data.type,
    status: data.status,
    priorityWeight: data.priorityWeight,
    displayOrder: data.displayOrder ?? null,
    translations: questionTranslationsOf(data.translations),
    options: optionsOf(
      list(data.options)
        .filter(isObject)
        .map((option) => ({
          value: option.value,
          displayOrder: option.displayOrder,
          translations: option.translations,
          effects: list(option.effects)
            .filter(isObject)
            .map((effect) => ({ attribute: effect.attribute, value: effect.weight })),
        })),
    ),
  };
}

/**
 * The comparable shape of a stored question. Archived options are left out:
 * an update keeps them archived unless the file lists them again, which then
 * shows as an added option.
 */
export function questionFromStored(item: QuestionDetail, slugs: SlugMaps): Json {
  return {
    category: slugOf(slugs.categories, item.categoryId),
    type: item.type,
    status: item.status,
    priorityWeight: item.priorityWeight,
    displayOrder: item.displayOrder,
    translations: questionTranslationsOf(item.translations),
    options: optionsOf(
      item.options
        .filter((option) => option.status !== "archived")
        .map((option) => ({
          value: option.value,
          displayOrder: option.displayOrder,
          translations: option.translations,
          effects: option.effects.map((effect) => ({
            attribute: slugOf(slugs.attributes, effect.attributeId),
            value: effect.weight,
          })),
        })),
    ),
  };
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lists the changed leaves, descending into objects; arrays (highlights, best
 * months) are compared as a whole. `before` or `after` is undefined when the
 * field exists on one side only.
 */
export function diffComparable(before: unknown, after: unknown, path = ""): FieldChange[] {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => diffComparable(before[key], after[key], path ? `${path}.${key}` : key));
  }
  return equal(before, after) ? [] : [{ path, before, after }];
}
