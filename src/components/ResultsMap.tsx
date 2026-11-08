import { useTranslation } from "react-i18next";
import { MAP_HEIGHT, MAP_WIDTH } from "../../shared/map-projection";
import { DEFAULT_LOCALE, isLocale } from "../../shared/locales";
import { layoutPins, PIN_RADIUS, type MapLocation } from "../diagnosis/mapPins";
import { cardClass, ticketLabelClass } from "./classes";

export interface MapResult {
  rank: number;
  name: string;
  countryName: string | null;
  location: MapLocation | null;
}

/**
 * World map of the shown results with numbered pins (docs/working/DECISIONS.md
 * ADR-036). It supplements the result list: the pins are decorative, and the
 * figure's text alternative names every destination it shows. The land shape
 * is the static public/world-map.svg, fetched only when this map renders.
 */
export function ResultsMap({ results }: { results: readonly MapResult[] }) {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const located = results.flatMap((result) => (result.location ? [{ ...result, location: result.location }] : []));
  if (located.length === 0) {
    return null;
  }

  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const describe = (result: MapResult) =>
    result.countryName
      ? t("results.map.item", { rank: t("results.rank", { rank: result.rank }), name: result.name, country: result.countryName })
      : t("results.map.itemNoCountry", { rank: t("results.rank", { rank: result.rank }), name: result.name });
  const missing = results.filter((result) => !result.location);
  const pins = layoutPins(located);

  return (
    <figure aria-labelledby="results-map-heading" className={cardClass}>
      <p aria-hidden="true" className={`${ticketLabelClass} text-muted`}>
        {t("ticket.routeMap")}
      </p>
      <h2 id="results-map-heading" className="mt-1 text-lg font-bold">
        {t("results.map.heading")}
      </h2>
      <div
        role="img"
        aria-label={t("results.map.label", { list: list.format(located.map(describe)) })}
        className="relative mx-auto mt-3 w-full max-w-2xl"
        style={{ aspectRatio: `${String(MAP_WIDTH)} / ${String(MAP_HEIGHT)}` }}
      >
        <div className="world-map-land absolute inset-0 bg-muted/30" />
        <svg
          viewBox={`0 0 ${String(MAP_WIDTH)} ${String(MAP_HEIGHT)}`}
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          {pins.map((pin) => (
            <g key={pin.rank} data-rank={pin.rank}>
              {(pin.labelX !== pin.x || pin.labelY !== pin.y) && (
                <line x1={pin.x} y1={pin.y} x2={pin.labelX} y2={pin.labelY} className="stroke-ink" strokeWidth={3} />
              )}
              <circle cx={pin.x} cy={pin.y} r={6} className="fill-ink" />
            </g>
          ))}
          {[...pins].reverse().map((pin) => (
            <g key={pin.rank}>
              <circle
                cx={pin.labelX}
                cy={pin.labelY}
                r={PIN_RADIUS}
                className={pin.rank === 1 ? "fill-accent stroke-surface" : "fill-ink stroke-surface"}
                strokeWidth={4}
              />
              <text
                x={pin.labelX}
                y={pin.labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={32}
                fontWeight={700}
                className={pin.rank === 1 ? "fill-accent-ink" : "fill-surface"}
              >
                {pin.rank}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-col gap-1 text-sm text-muted">
        <span>{t("results.map.caption")}</span>
        {missing.length > 0 && <span>{t("results.map.missing", { list: list.format(missing.map(describe)) })}</span>}
      </figcaption>
    </figure>
  );
}
