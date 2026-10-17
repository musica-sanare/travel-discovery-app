/**
 * Best travel months are stored as a 12-bit mask (bit m - 1 = month m) and
 * exchanged as a sorted list of months 1-12 (docs/DATA_MODEL.md "Phase 2
 * schema notes").
 */
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const MAX_MONTHS_MASK = 0b1111_1111_1111;

export function monthsToMask(months: readonly number[]): number | null {
  let mask = 0;
  for (const month of months) {
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      mask |= 1 << (month - 1);
    }
  }
  return mask === 0 ? null : mask;
}

export function maskToMonths(mask: number | null): number[] | null {
  if (mask === null || !Number.isInteger(mask) || mask < 1 || mask > MAX_MONTHS_MASK) {
    return null;
  }
  return MONTHS.filter((month) => (mask & (1 << (month - 1))) !== 0);
}
