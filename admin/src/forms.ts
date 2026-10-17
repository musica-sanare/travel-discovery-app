/** Helpers converting form strings to API payload values. */
export function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function numberToText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
