import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { DocumentMetadata } from "../components/DocumentMetadata";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function RootLayout() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentMetadata />
      <header className="site-header">
        <Link to="/" className="site-name">
          {t("app.name")}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </>
  );
}
