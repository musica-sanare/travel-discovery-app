import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** Localized replacement for React Router's default (English-only) error screen. */
export function RouteErrorPage() {
  const { t } = useTranslation();

  return (
    <main className="site-main">
      <section aria-labelledby="route-error-heading">
        <h1 id="route-error-heading">{t("routeError.heading")}</h1>
        <p>{t("routeError.body")}</p>
        <Link to="/">{t("routeError.backHome")}</Link>
      </section>
    </main>
  );
}
