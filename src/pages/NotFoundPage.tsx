import { useTranslation } from "react-i18next";
import { TicketNotice } from "../components/TicketNotice";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <TicketNotice
      code={t("ticket.gateNotFound")}
      heading={t("notFound.heading")}
      body={t("notFound.body")}
      homeLabel={t("notFound.backHome")}
    />
  );
}
