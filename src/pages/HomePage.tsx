import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClass } from "../components/classes";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="home-heading" className="flex flex-col gap-6 py-6 sm:py-12">
      <h1 id="home-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("home.heading")}
      </h1>
      <p className="text-lg text-muted">{t("home.lead")}</p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {(["step1", "step2", "step3"] as const).map((step, index) => (
          <li key={step} className="rounded-xl border border-line bg-surface p-4">
            <span className="block text-sm font-semibold text-accent">{index + 1}</span>
            {t(`home.${step}`)}
          </li>
        ))}
      </ol>
      <p>
        <Link to="/plan" className={buttonClass.primary}>
          {t("home.start")}
        </Link>
      </p>
    </section>
  );
}
