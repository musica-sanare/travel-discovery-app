import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { DocumentMetadata } from "../../../src/components/DocumentMetadata";
import { LanguageSwitcher } from "../../../src/components/LanguageSwitcher";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { useLoad } from "../hooks";

const NAV_ITEMS = [
  ["/destinations", "nav.destinations"],
  ["/questions", "nav.questions"],
  ["/countries", "nav.countries"],
  ["/attributes", "nav.attributes"],
  ["/categories", "nav.categories"],
  ["/settings", "nav.settings"],
] as const;

/**
 * Admin shell. Showing the identity here is informational only; every admin
 * API call is authorized on the server.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const me = useLoad(() => adminApi<{ email: string }>("/me"), "me");

  return (
    <>
      <DocumentMetadata />
      <header className="admin-header">
        <strong>{t("meta.title")}</strong>
        {me.data && <span>{t("common.signedInAs", { email: me.data.email })}</span>}
        <LanguageSwitcher />
      </header>
      <nav className="admin-nav" aria-label={t("nav.label")}>
        <ul>
          {NAV_ITEMS.map(([to, label]) => (
            <li key={to}>
              <NavLink to={to}>{t(label)}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="admin-main">
        <ErrorBanner error={me.error} />
        <Outlet />
      </main>
    </>
  );
}
