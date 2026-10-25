import { useTranslation } from "react-i18next";
import { TicketNotice } from "../components/TicketNotice";

/** Localized replacement for React Router's default (English-only) error screen. */
export function RouteErrorPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <TicketNotice
        code={t("ticket.delayed")}
        heading={t("routeError.heading")}
        body={t("routeError.body")}
        homeLabel={t("routeError.backHome")}
      />
    </main>
  );
}
