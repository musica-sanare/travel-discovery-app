import { useId, type CSSProperties } from "react";

/*
 * Decorative inline SVGs drawn for this project (no third-party icon sets).
 * They are hidden from assistive technology and inherit `currentColor`.
 */

type SvgProps = { className?: string; style?: CSSProperties };

const PLANE_POINTS =
  "12,2 13.2,3.5 13.2,9 21,13.5 21,15.5 13.2,13 13.2,18.5 15.5,20.3 15.5,21.8 12,20.8 8.5,21.8 8.5,20.3 10.8,18.5 10.8,13 3,15.5 3,13.5 10.8,9 10.8,3.5";

/** Top-down airliner pointing up; rotate with a class to change heading. */
export function PlaneIcon({ className, style }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} style={style}>
      <polygon fill="currentColor" points={PLANE_POINTS} />
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

/** Sunset over the sea with a dashed flight path; the hero illustration. */
export function HorizonArt({ className }: SvgProps) {
  const id = useId();
  const sun = `${id}-sun`;
  const clip = `${id}-clip`;
  const mask = `${id}-mask`;
  return (
    <svg viewBox="0 0 400 260" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id={sun} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c65b" />
          <stop offset="0.55" stopColor="#f2a93b" />
          <stop offset="1" stopColor="#d85a30" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="0" y="0" width="400" height="190" />
        </clipPath>
        <mask id={mask}>
          <rect x="0" y="0" width="400" height="260" fill="white" />
          {[132, 150, 166, 179].map((y, index) => (
            <rect key={y} x="0" y={y} width="400" height={String(3 + index)} fill="black" />
          ))}
        </mask>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <circle cx="200" cy="190" r="96" fill={`url(#${sun})`} mask={`url(#${mask})`} />
      </g>
      <path d="M0 190H400" className="stroke-sky-muted" strokeWidth="1.5" opacity="0.6" />
      {[
        { x: 150, y: 204, width: 100 },
        { x: 165, y: 218, width: 70 },
        { x: 180, y: 232, width: 40 },
      ].map(({ x, y, width }) => (
        <path
          key={y}
          d={`M${String(x)} ${String(y)}h${String(width)}`}
          stroke="#f2a93b"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
      ))}
      <path
        d="M24 236C90 120 250 30 356 64"
        fill="none"
        className="stroke-sky-muted"
        strokeWidth="2"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <circle cx="24" cy="236" r="5" className="fill-sky-muted" />
      <polygon
        transform="translate(356 64) rotate(108) scale(1.2) translate(-12 -12)"
        className="fill-sky-ink"
        points={PLANE_POINTS}
      />
    </svg>
  );
}

const BARCODE_WIDTHS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 1, 2, 3, 1, 1, 2, 1, 3, 1];
const BARCODE_STARTS = BARCODE_WIDTHS.map((_, index) => BARCODE_WIDTHS.slice(0, index).reduce((sum, w) => sum + w, 0));
const BARCODE_LENGTH = BARCODE_WIDTHS.reduce((sum, width) => sum + width, 0);
/** Every other segment is a bar; the rest are gaps. */
const BARCODE_BARS = BARCODE_WIDTHS.flatMap((width, index) =>
  index % 2 === 0 ? [{ x: BARCODE_STARTS[index] ?? 0, width }] : [],
);

/** Decorative boarding-pass barcode; it encodes nothing. */
export function Barcode({ className }: SvgProps) {
  return (
    <svg
      viewBox={`0 0 ${String(BARCODE_LENGTH)} 10`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      {BARCODE_BARS.map((bar) => (
        <rect key={bar.x} x={bar.x} y="0" width={bar.width} height="10" />
      ))}
    </svg>
  );
}
