/*
 * Decorative inline SVGs drawn for this project (no third-party icon sets).
 * They are hidden from assistive technology and inherit `currentColor`.
 */

type SvgProps = { className?: string };

/** Top-down airliner pointing up; rotate with a class to change heading. */
export function PlaneIcon({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <polygon
        fill="currentColor"
        points="12,2 13.2,3.5 13.2,9 21,13.5 21,15.5 13.2,13 13.2,18.5 15.5,20.3 15.5,21.8 12,20.8 8.5,21.8 8.5,20.3 10.8,18.5 10.8,13 3,15.5 3,13.5 10.8,9 10.8,3.5"
      />
    </svg>
  );
}

export function GlobeIcon({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" />
    </svg>
  );
}

/** Faint latitude/longitude lines, used as a map-like texture behind content. */
export function Graticule({ className }: SvgProps) {
  const meridians = [60, 120, 180, 240];
  const parallels = [40, 80, 120, 160, 200, 240, 280];
  return (
    <svg
      viewBox="0 0 600 320"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <ellipse cx="300" cy="160" rx="300" ry="300" />
      {meridians.map((rx) => (
        <ellipse key={rx} cx="300" cy="160" rx={rx} ry="300" />
      ))}
      <path d="M300 -140V460" />
      {parallels.map((y) => (
        <path key={y} d={`M0 ${String(y)}Q300 ${String(y + (y - 160) * 0.25)} 600 ${String(y)}`} />
      ))}
    </svg>
  );
}
