import { useTranslation } from "react-i18next";
import { ticketLabelClass } from "./classes";
import { PlaneIcon } from "./Decorations";

/**
 * Decorative progress bar drawn as a flight path. The page heading carries
 * the accessible progress text, so this is hidden from assistive technology.
 */
export function FlightRoute({ percent }: { percent: number }) {
  const { t } = useTranslation();
  const position = `${String(Math.min(100, Math.max(0, percent)))}%`;

  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span className={`${ticketLabelClass} text-sky-muted`}>{t("ticket.routeFrom")}</span>
      <div className="relative mx-3 h-8 flex-1">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-sky-muted/50" />
        <div
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full bg-sun transition-[width] duration-300"
          style={{ width: position }}
        />
        <span className="absolute top-1/2 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun" />
        <span className="absolute top-1/2 right-0 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-muted" />
        <PlaneIcon
          className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rotate-90 text-sun transition-[left] duration-300"
          style={{ left: position }}
        />
      </div>
      <span className={`${ticketLabelClass} text-sky-muted`}>{t("ticket.routeTo")}</span>
    </div>
  );
}
