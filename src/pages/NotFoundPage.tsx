import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">{t("notFound.heading")}</h1>
      <p>{t("notFound.body")}</p>
      <Link to="/">{t("notFound.backHome")}</Link>
    </section>
  );
}
