/** Result variety (docs/en/DIAGNOSTIC_ALGORITHM.md "Result variety", ADR-037). */
import { describe, expect, it } from "vitest";
import { drawUniform, fnv1a, MAX_RESULT_DRAW, mix32, nearFitBand, pickResults, RESULT_BAND } from "./variety";

const candidate = (slug: string, fit: number) => ({ slug, fit });

/** Twelve candidates: first 80, then 79 down to 69 (band: 79-70, ten destinations). */
const ORDERED = [candidate("a", 80), ...Array.from({ length: 11 }, (_, index) => candidate(`b${String(index).padStart(2, "0")}`, 79 - index))];

describe("hash helpers", () => {
  it("match published reference values", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).toBe(mix32(1));
    expect(mix32(1)).not.toBe(mix32(2));
  });

  it("gives a draw number in (0, 1) that depends on the seed, the draw, and the slug only", () => {
    const value = drawUniform(7, 0, "lisbon");
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
    expect(drawUniform(7, 0, "lisbon")).toBe(value);
    expect(drawUniform(8, 0, "lisbon")).not.toBe(value);
    expect(drawUniform(7, 1, "lisbon")).not.toBe(value);
    expect(drawUniform(7, 0, "taipei")).not.toBe(value);
  });
});

describe("nearFitBand", () => {
  it("holds the destinations after the first within the margin, among the best `size`", () => {
    expect(RESULT_BAND).toEqual({ fitMargin: 10, size: 12 });
    expect(nearFitBand(ORDERED).map((item) => item.fit)).toEqual([79, 78, 77, 76, 75, 74, 73, 72, 71, 70]);
    const many = [candidate("a", 80), ...Array.from({ length: 20 }, (_, index) => candidate(`c${String(index).padStart(2, "0")}`, 79))];
    expect(nearFitBand(many)).toHaveLength(RESULT_BAND.size - 1);
    expect(nearFitBand([])).toEqual([]);
  });

  it("includes a fit exactly at the margin", () => {
    expect(nearFitBand([candidate("a", 80), candidate("b", 70), candidate("c", 69.99)]).map((item) => item.slug)).toEqual(["b"]);
  });
});

describe("pickResults", () => {
  it("always shows the best fit first and keeps the fit order", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { shown, redrawable } = pickResults(ORDERED, 5, { seed, draw: 0 });
      expect(redrawable).toBe(true);
      expect(shown).toHaveLength(5);
      expect(shown[0]?.slug).toBe("a");
      expect(shown.map((item) => item.fit)).toEqual([...shown.map((item) => item.fit)].sort((x, y) => y - x));
      for (const item of shown.slice(1)) expect(item.fit).toBeGreaterThanOrEqual(70);
    }
  });

  it("is reproducible for a seed and varies between seeds", () => {
    const sets = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const first = pickResults(ORDERED, 5, { seed, draw: 0 }).shown.map((item) => item.slug).join(",");
      expect(pickResults(ORDERED, 5, { seed, draw: 0 }).shown.map((item) => item.slug).join(",")).toBe(first);
      sets.add(first);
    }
    expect(sets.size).toBeGreaterThan(10);
  });

  it("prefers closer fits", () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 2000; seed++) {
      for (const item of pickResults(ORDERED, 5, { seed, draw: 0 }).shown.slice(1)) counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
    }
    expect(counts.get("b00") ?? 0).toBeGreaterThan(counts.get("b09") ?? 0);
  });

  it("keeps the shown destinations when a band destination that was not drawn is removed", () => {
    const shownFor = (items: readonly { slug: string; fit: number }[]) =>
      pickResults(items, 5, { seed: 3, draw: 0 }).shown.map((item) => item.slug);
    const full = shownFor(ORDERED);
    const notDrawn = nearFitBand(ORDERED).find((item) => !full.includes(item.slug));
    expect(notDrawn).toBeDefined();
    expect(shownFor(ORDERED.filter((item) => item.slug !== notDrawn?.slug))).toEqual(full);
  });

  it("shows destinations not yet shown on the next draws, then repeats", () => {
    const seen = new Set<string>();
    const draw0 = pickResults(ORDERED, 5, { seed: 11, draw: 0 }).shown.slice(1);
    const draw1 = pickResults(ORDERED, 5, { seed: 11, draw: 1 }).shown.slice(1);
    for (const item of draw0) seen.add(item.slug);
    for (const item of draw1) expect(seen.has(item.slug)).toBe(false);
    const draw2 = pickResults(ORDERED, 5, { seed: 11, draw: 2 }).shown.slice(1);
    // The band has ten destinations: draws 0 and 1 show eight, so draw 2 shows the last two first.
    const unseen = nearFitBand(ORDERED).filter((item) => !seen.has(item.slug) && !draw1.some((shown) => shown.slug === item.slug));
    expect(unseen).toHaveLength(2);
    for (const item of unseen) expect(draw2.map((shown) => shown.slug)).toContain(item.slug);
    expect(pickResults(ORDERED, 5, { seed: 11, draw: MAX_RESULT_DRAW }).shown).toHaveLength(5);
  });

  it("returns the first results by fit when the band does not exceed the free slots", () => {
    const small = [candidate("a", 80), candidate("b", 79), candidate("c", 75), candidate("d", 71), candidate("e", 60), candidate("f", 50)];
    expect(pickResults(small, 5, { seed: 1, draw: 0 })).toEqual({ shown: small.slice(0, 5), redrawable: false });
    expect(pickResults(small.slice(0, 2), 5, { seed: 1, draw: 0 })).toEqual({ shown: small.slice(0, 2), redrawable: false });
    expect(pickResults([], 5, { seed: 1, draw: 0 })).toEqual({ shown: [], redrawable: false });
  });
});
