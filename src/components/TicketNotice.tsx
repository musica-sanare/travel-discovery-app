import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { buttonClass, ticketLabelClass } from "./classes";
import { Graticule } from "./Decorations";

/** Full-page notice on the navy band, used by the not-found and route error pages. */
export function TicketNotice({
  code,
  heading,
  body,
  homeLabel,
}: {
  /** Decorative departure-board caption, hidden from assistive technology. */
  code: string;
  heading: string;
  body: ReactNode;
  homeLabel: string;
}) {
  const id = useId();

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="on-sky relative overflow-hidden rounded-2xl bg-sky px-6 py-10 shadow-md sm:px-10"
    >
      <Graticule className="pointer-events-none absolute inset-0 size-full text-sky-muted opacity-10" />
      <div className="relative flex flex-col items-start gap-4">
        <p aria-hidden="true" className={`${ticketLabelClass} text-sun`}>
          {code}
        </p>
        <h1 id={`${id}-heading`} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {heading}
        </h1>
        <p className="text-sky-muted">{body}</p>
        <Link to="/" className={`${buttonClass.primary} mt-2`}>
          {homeLabel}
        </Link>
      </div>
    </section>
  );
}
