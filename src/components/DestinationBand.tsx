import { useTranslation } from "react-i18next";
import type { DiagnosisContentDestination } from "../../shared/diagnosis-content";
import { ticketLabelClass } from "./classes";
import { Graticule } from "./Decorations";

type DestinationType = DiagnosisContentDestination["type"];

/** Postcard-style gradients; a destination always gets the same one. */
const BANDS = [
  "from-[#f2a93b] via-[#d85a30] to-[#6b2752]",
  "from-[#4fb3e8] via-[#0e7490] to-[#0b2545]",
  "from-[#5dcaa5] via-[#1d9e75] to-[#0b4f4a]",
  "from-[#f6c65b] via-[#e07a4f] to-[#8f3b2f]",
  "from-[#a78bfa] via-[#6d4fc2] to-[#1e1b4b]",
] as const;

const TYPE_LABEL_KEYS = {
  city: "ticket.typeCity",
  region: "ticket.typeRegion",
  island: "ticket.typeIsland",
  other: "ticket.typeOther",
} as const;

const TYPE_PATHS: Record<DestinationType, string> = {
  city: "M3 21V10h5v11M8 21V4h7v17M15 21v-8h6v8M2 21h20M11 8h1M11 12h1M11 16h1",
  island: "M2 19c3-2 6-2 10 0s7 2 10 0M10 18c0-4 1-7 3-9M13 9c-2-2-5-2-7 0M13 9c2-2 5-2 7 0M13 9c0-3-2-5-4-5",
  region: "M2 20l7-12 4 6 3-4 6 10zM7 11l2 1 2-1",
  other: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
};

function bandFor(slug: string) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BANDS[hash % BANDS.length] ?? BANDS[0];
}

/** Decorative header band for a result card: gradient, map lines, type icon, and rank. */
export function DestinationBand({ slug, type, rank }: { slug: string; type: DestinationType; rank: number }) {
  const { t } = useTranslation();
  const featured = rank === 1;

  return (
    <div
      aria-hidden="true"
      className={`relative flex items-end justify-between overflow-hidden bg-linear-to-br px-5 pb-3 text-white sm:px-6 ${bandFor(slug)} ${featured ? "h-32" : "h-24"}`}
    >
      <Graticule className="pointer-events-none absolute inset-0 size-full opacity-20" />
      <div className="relative flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={TYPE_PATHS[type]} />
        </svg>
        <span className={ticketLabelClass}>{t(TYPE_LABEL_KEYS[type])}</span>
        {featured && (
          <span className={`${ticketLabelClass} rounded-md bg-white/20 px-2 py-0.5`}>{t("ticket.firstClass")}</span>
        )}
      </div>
      <span className="relative font-mono text-4xl font-bold sm:text-5xl">{String(rank).padStart(2, "0")}</span>
    </div>
  );
}
