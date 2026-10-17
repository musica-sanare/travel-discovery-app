import { describe, expect, it } from "vitest";
import { parseConstraints, type ConstraintsDraft } from "./constraintsForm";

const EMPTY: ConstraintsDraft = { days: "", months: [], budgetAmount: "", budgetCurrency: "JPY" };

describe("parseConstraints", () => {
  it("treats blank fields as not supplied", () => {
    expect(parseConstraints(EMPTY)).toEqual({ ok: true, constraints: {} });
  });

  it("parses days, months, and budget", () => {
    expect(parseConstraints({ days: " 5 ", months: [10, 4, 4, 13], budgetAmount: "200000", budgetCurrency: "EUR" })).toEqual({
      ok: true,
      constraints: { days: 5, months: [4, 10], budget: { amount: 200_000, currency: "EUR" } },
    });
  });

  it.each(["0", "366", "2.5", "-1", "1e3", "abc"])("rejects invalid days %s", (days) => {
    expect(parseConstraints({ ...EMPTY, days })).toEqual({ ok: false, errors: ["days"] });
  });

  it.each(["0", "100000001", "1.5", "-5"])("rejects invalid budget %s", (budgetAmount) => {
    expect(parseConstraints({ ...EMPTY, budgetAmount })).toEqual({ ok: false, errors: ["budget"] });
  });
});
