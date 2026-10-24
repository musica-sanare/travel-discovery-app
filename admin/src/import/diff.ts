/**
 * Field-level differences between a bundle destination and the stored one, for
 * the opt-in update mode of the Import page (ADR-028). Both sides are brought
 * into one comparable shape with slug references, applying the same defaults
 * and trimming as the admin API validation, so that a destination imported
 * unchanged compares equal to the file it came from.
 */
import { SUPPORTED_LOCALES } from "../../../shared/locales";
import { SUPPORTED_CURRENCIES, type DestinationDetail } from "../types";

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

function translationsOf(value: unknown): Json {
  const source = isObject(value) ? value : {};
  const result: Json = {};
  for (const locale of SUPPORTED_LOCALES) {
    const entry = source[locale];
    if (!isObject(entry)) continue;
    result[locale] = {
      name: requiredText(entry.name),
      summary: requiredText(entry.summary),
      highlights: list(entry.highlights).map(requiredText),
      cautions: optionalText(entry.cautions),
      bestSeason: optionalText(entry.bestSeason),
      imageAlt: optionalText(entry.imageAlt),
    };
  }
  return result;
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

function scoresOf(scores: readonly { attribute: unknown; score: unknown }[]): Json {
  const result: Json = {};
  for (const { attribute, score } of [...scores].sort((a, b) => String(a.attribute).localeCompare(String(b.attribute)))) {
    result[String(attribute)] = score;
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
export function comparableFromBundle(data: Json): Json {
  const days = isObject(data.recommendedDays) ? data.recommendedDays : {};
  return {
    country: data.country,
    type: data.type,
    status: data.status,
    recommendedDays: { min: days.min ?? null, max: days.max ?? null },
    bestMonths: monthsOf(data.bestMonths),
    costs: costsOf(data.costs),
    image: imageOf(data.image),
    translations: translationsOf(data.translations),
    attributeScores: scoresOf(
      list(data.attributeScores)
        .filter(isObject)
        .map((score) => ({ attribute: score.attribute, score: score.score })),
    ),
  };
}

/** The comparable shape of a stored destination; IDs are turned back into slugs. */
export function comparableFromStored(
  item: DestinationDetail,
  slugs: { countries: ReadonlyMap<number, string>; attributes: ReadonlyMap<number, string> },
): Json {
  const slugOf = (map: ReadonlyMap<number, string>, id: number) => map.get(id) ?? `#${String(id)}`;
  return {
    country: slugOf(slugs.countries, item.countryId),
    type: item.type,
    status: item.status,
    recommendedDays: { min: item.recommendedDays.min, max: item.recommendedDays.max },
    bestMonths: monthsOf(item.bestMonths),
    costs: costsOf(item.costs),
    image: imageOf(item.image),
    translations: translationsOf(item.translations),
    attributeScores: scoresOf(
      item.attributeScores.map((score) => ({ attribute: slugOf(slugs.attributes, score.attributeId), score: score.score })),
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
