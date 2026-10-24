import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClass, ticketLabelClass } from "../components/classes";
import { Graticule, HorizonArt, PlaneIcon } from "../components/Decorations";

const STEPS = [
  { key: "step1", status: "checkIn" },
  { key: "step2", status: "boarding" },
  { key: "step3", status: "departure" },
] as const;

export function HomePage() {
  const { t } = useTranslation();

  return (
    <>
      <section
        aria-labelledby="home-heading"
        className="on-sky relative overflow-hidden bg-linear-to-b from-sky to-sky-deep"
      >
        <Graticule className="pointer-events-none absolute inset-0 size-full text-sky-muted opacity-10" />
        <div className="relative mx-auto grid max-w-5xl items-center gap-8 px-4 pt-10 pb-12 sm:pt-16 sm:pb-20 md:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col items-start gap-5">
            <p aria-hidden="true" className={`${ticketLabelClass} text-sun`}>
              {t("ticket.nowBoarding")}
            </p>
            <h1 id="home-heading" className="text-4xl leading-tight font-extrabold tracking-tight text-balance [word-break:auto-phrase] sm:text-5xl">
              {t("home.heading")}
            </h1>
            <p className="text-lg text-sky-muted">{t("home.lead")}</p>
            <Link to="/plan" className={`${buttonClass.primary} mt-2 px-7 text-lg`}>
              <PlaneIcon className="size-5 rotate-45" />
              {t("home.start")}
            </Link>
          </div>
          <HorizonArt className="mx-auto w-full max-w-sm md:max-w-md" />
        </div>
      </section>

      <section aria-labelledby="board-heading" className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <div className="on-sky overflow-hidden rounded-2xl bg-sky shadow-lg">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-4 sm:px-6">
            <h2 id="board-heading" className="text-xl font-bold">
              {t("home.boardHeading")}
            </h2>
            <span aria-hidden="true" className={`${ticketLabelClass} text-sun`}>
              {t("ticket.departures")}
            </span>
          </div>
          <div
            aria-hidden="true"
            className={`${ticketLabelClass} hidden grid-cols-[4rem_1fr_9rem] gap-4 border-t border-sky-muted/25 px-6 py-2 text-sky-muted sm:grid`}
          >
            <span>{t("ticket.stepColumn")}</span>
            <span />
            <span>{t("ticket.statusColumn")}</span>
          </div>
          <ol>
            {STEPS.map(({ key, status }, index) => (
              <li
                key={key}
                className="grid grid-cols-[3rem_1fr] items-center gap-x-4 gap-y-1 border-t border-sky-muted/25 px-5 py-4 sm:grid-cols-[4rem_1fr_9rem] sm:px-6"
              >
                <span className="font-mono text-2xl font-bold text-sun">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-lg font-semibold">{t(`home.${key}`)}</span>
                <span
                  aria-hidden="true"
                  className={`${ticketLabelClass} col-start-2 justify-self-start rounded-md border border-sun/60 px-2 py-1 text-sun sm:col-start-3`}
                >
                  {t(`ticket.${status}`)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
