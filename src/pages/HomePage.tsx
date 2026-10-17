import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">{t("home.heading")}</h1>
      <p>{t("home.lead")}</p>
      <p className="notice">{t("home.notice")}</p>
    </section>
  );
}
