import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">{t("home.heading")}</h1>
      <p>{t("home.lead")}</p>
      <p>
        <Link to="/plan" className="button">
          {t("home.start")}
        </Link>
      </p>
      <p className="notice">{t("home.privacy")}</p>
    </section>
  );
}
