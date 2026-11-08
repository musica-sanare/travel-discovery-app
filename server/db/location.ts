/**
 * Reads a destination's representative point from its `latitude` and
 * `longitude` columns (DATA_MODEL.md "Phase 20 schema notes"). D1 returns a
 * double-quoted column name as a string when the column does not exist, so a
 * read before the migration yields text instead of an error ("Phase 21
 * verification log" in docs/working/DECISIONS.md). Anything other than two
 * coordinates in range is treated as no location, so the content stays valid.
 */
export interface Location {
  latitude: number;
  longitude: number;
}

/** `invalid` is true when a value is present but is not a usable coordinate. */
export function readLocation(latitude: unknown, longitude: unknown): { location: Location | null; invalid: boolean } {
  if (latitude === null && longitude === null) {
    return { location: null, invalid: false };
  }
  const valid =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  return valid ? { location: { latitude, longitude }, invalid: false } : { location: null, invalid: true };
}
