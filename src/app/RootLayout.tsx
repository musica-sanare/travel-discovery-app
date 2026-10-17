import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { DocumentMetadata } from "../components/DocumentMetadata";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { QuizSessionProvider } from "../diagnosis/QuizSessionProvider";

export function RootLayout() {
  const { t } = useTranslation();

  return (
    <QuizSessionProvider>
      <DocumentMetadata />
      <a
        href="#main"
        className="sr-only rounded-lg bg-surface px-4 py-2 shadow-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10"
      >
        {t("common.skipToContent")}
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-ink no-underline hover:no-underline">
            {t("app.name")}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Outlet />
      </main>
    </QuizSessionProvider>
  );
}
