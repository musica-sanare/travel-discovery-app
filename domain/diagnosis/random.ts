/**
 * Seeded randomness for question selection (docs/en/DIAGNOSTIC_ALGORITHM.md §7).
 * Each step's number depends only on (seed, step), never on earlier draws.
 */
const GOLDEN_RATIO_32 = 0x9e3779b9;

/** First output of mulberry32 for a 32-bit state, in [0, 1). */
export function mulberry32(state: number): number {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function stepRandom(seed: number, step: number): number {
  return mulberry32((seed ^ Math.imul(step + 1, GOLDEN_RATIO_32)) >>> 0);
}

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}
