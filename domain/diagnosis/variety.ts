/**
 * Seeded choice of the shown results from a near-fit band
 * (docs/en/DIAGNOSTIC_ALGORITHM.md "Result variety", docs/working/DECISIONS.md
 * ADR-037). Fit values and their order never change; only which of the
 * well-fitting destinations fill the slots after the first does. Pure: the
 * same candidates, seed, and draw always give the same results, and a
 * destination's draw depends only on the seed, the draw, and its slug, so
 * adding or removing destinations does not reorder the others.
 */

/** Highest draw number ("Show other destinations" presses) a request may carry. */
export const MAX_RESULT_DRAW = 20;

/** Destinations within `fitMargin` points of the best fit, among the best `size`, can fill the slots after the first. */
export const RESULT_BAND = { fitMargin: 10, size: 12 } as const;

/** The quiz's session seed and how many times the user asked for other destinations. */
export interface ResultVariety {
  seed: number;
  draw: number;
}

const SELECTION_SALT = 0x3c6ef372;
const GOLDEN_RATIO_32 = 0x9e3779b9;

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The MurmurHash3 finalizer: a bijective 32-bit mix. */
export function mix32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * A number in (0, 1) for a destination in one draw. The salt keeps it
 * independent of the question selection, which uses the same session seed.
 */
export function drawUniform(seed: number, draw: number, slug: string): number {
  const drawSeed = mix32((seed ^ SELECTION_SALT ^ Math.imul(draw + 1, GOLDEN_RATIO_32)) >>> 0);
  return (mix32(drawSeed ^ fnv1a(slug)) + 0.5) / 2 ** 32;
}

/** The band: destinations after the first, among the best `size`, with fit ≥ best fit − `fitMargin`. */
export function nearFitBand<T extends { fit: number }>(ordered: readonly T[]): T[] {
  const first = ordered[0];
  if (first === undefined) return [];
  const floor = first.fit - RESULT_BAND.fitMargin;
  return ordered.slice(1, RESULT_BAND.size).filter((item) => item.fit >= floor);
}

/**
 * One draw of `slots` destinations from the band: a weighted draw without
 * replacement (key ln(u)/w, w = 1 + (fit − floor) / fitMargin, so a closer fit
 * is up to twice as likely). Destinations shown in earlier draws come last.
 */
function drawFromBand<T extends { slug: string; fit: number }>(
  band: readonly T[],
  floor: number,
  slots: number,
  seed: number,
  draw: number,
  shownBefore: ReadonlySet<string>,
): T[] {
  const keyed = band.map((item) => ({
    item,
    seen: shownBefore.has(item.slug) ? 1 : 0,
    key: Math.log(drawUniform(seed, draw, item.slug)) / (1 + (item.fit - floor) / RESULT_BAND.fitMargin),
  }));
  keyed.sort((a, b) => a.seen - b.seen || b.key - a.key || (a.item.slug < b.item.slug ? -1 : a.item.slug > b.item.slug ? 1 : 0));
  return keyed.slice(0, slots).map((entry) => entry.item);
}

/**
 * The shown results for a seed and draw, in the input order (fit order).
 * The best fit is always first. When the band has no more destinations than
 * the slots after the first, the result is the first `count` (no variety) and
 * `redrawable` is false.
 *
 * @param ordered every eligible destination in ranking order (fit, coverage, slug)
 */
export function pickResults<T extends { slug: string; fit: number }>(
  ordered: readonly T[],
  count: number,
  variety: ResultVariety,
): { shown: T[]; redrawable: boolean } {
  const first = ordered[0];
  const band = nearFitBand(ordered);
  const slots = count - 1;
  if (first === undefined || band.length <= slots) {
    return { shown: ordered.slice(0, count), redrawable: false };
  }
  const floor = first.fit - RESULT_BAND.fitMargin;
  const shownBefore = new Set<string>();
  let picks: T[] = [];
  for (let draw = 0; draw <= variety.draw; draw++) {
    picks = drawFromBand(band, floor, slots, variety.seed, draw, shownBefore);
    for (const item of picks) shownBefore.add(item.slug);
  }
  const position = new Map(ordered.map((item, index) => [item.slug, index]));
  const shown = [first, ...picks].sort((a, b) => (position.get(a.slug) ?? 0) - (position.get(b.slug) ?? 0));
  return { shown, redrawable: true };
}
