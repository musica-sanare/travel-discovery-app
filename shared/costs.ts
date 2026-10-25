/**
 * Locale-neutral cost vocabulary shared by the database schema, admin
 * validation, and the diagnostic engine (docs/working/DECISIONS.md ADR-021).
 */
export const SUPPORTED_CURRENCIES = ["JPY", "USD", "EUR"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "JPY";

export const COST_PERIODS = ["per_day", "per_trip"] as const;
export type CostPeriod = (typeof COST_PERIODS)[number];

export const COST_SCOPES = [
  "per_person_excluding_international_flights",
  "per_person_including_international_flights",
] as const;
export type CostScope = (typeof COST_SCOPES)[number];

/** The only scope a user budget is compared against. */
export const BUDGET_COMPARABLE_SCOPE: CostScope = "per_person_excluding_international_flights";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** Orders currencies as listed in SUPPORTED_CURRENCIES. */
export function compareCurrencies(a: Currency, b: Currency): number {
  return SUPPORTED_CURRENCIES.indexOf(a) - SUPPORTED_CURRENCIES.indexOf(b);
}
