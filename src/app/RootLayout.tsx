import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { Graticule, PlaneIcon } from "../components/Decorations";
import { DocumentMetadata } from "../components/DocumentMetadata";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { QuizSessionProvider } from "../diagnosis/QuizSessionProvider";

export function RootLayout() {
  const { t } = useTranslation();

  return (
    <QuizSessionProvider>
      <DocumentMetadata />
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-lg bg-surface px-4 py-2 text-ink shadow-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20"
        >
          {t("common.skipToContent")}
        </a>
        <header className="on-sky relative overflow-hidden bg-sky">
          <Graticule className="pointer-events-none absolute inset-0 size-full text-sky-muted opacity-15" />
          <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-md text-lg font-bold tracking-tight text-sky-ink no-underline hover:no-underline"
            >
              <PlaneIcon className="size-6 rotate-45 text-sun" />
              {t("app.name")}
            </Link>
            <LanguageSwitcher />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
          <Outlet />
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted">
            <p>{t("footer.privacy")}</p>
            <p>{t("footer.costs")}</p>
          </div>
        </footer>
      </div>
    </QuizSessionProvider>
  );
}
