/** Parses the optional trip-constraints form into validated engine input. */
import type { Currency } from "../../shared/costs";
import { MAX_BUDGET, MAX_TRIP_DAYS } from "../../shared/trip-constraints";
import type { TripConstraints } from "../../domain/diagnosis";

export interface ConstraintsDraft {
  days: string;
  months: number[];
  budgetAmount: string;
  budgetCurrency: Currency;
}

function parsePositiveInt(value: string, max: number): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= max ? parsed : null;
}

export function parseConstraints(
  draft: ConstraintsDraft,
): { ok: true; constraints: TripConstraints } | { ok: false; errors: ("days" | "budget")[] } {
  const days = parsePositiveInt(draft.days, MAX_TRIP_DAYS);
  const amount = parsePositiveInt(draft.budgetAmount, MAX_BUDGET);
  const errors: ("days" | "budget")[] = [];
  if (days === null) errors.push("days");
  if (amount === null) errors.push("budget");
  if (errors.length > 0 || days === null || amount === null) {
    return { ok: false, errors };
  }
  const months = [...new Set(draft.months.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))].sort(
    (a, b) => a - b,
  );
  return {
    ok: true,
    constraints: {
      ...(days === undefined ? {} : { days }),
      ...(months.length === 0 ? {} : { months }),
      ...(amount === undefined ? {} : { budget: { amount, currency: draft.budgetCurrency } }),
    },
  };
}
