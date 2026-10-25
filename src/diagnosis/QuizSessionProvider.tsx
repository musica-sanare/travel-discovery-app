import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../shared/locales";
import { sharedContentCache, type ContentCache, type ContentLoadResult } from "./contentClient";
import { QuizSessionContext, type ContentState } from "./quizSessionContext";
import { INITIAL_SESSION, sessionReducer } from "./session";

/**
 * Holds the quiz session and the content snapshot in memory only
 * (docs/working/DECISIONS.md ADR-022). The snapshot is fetched once a quiz starts and
 * again when the language changes or a reload is requested; a page reload
 * starts from scratch.
 */
export function QuizSessionProvider({ children, cache = sharedContentCache }: { children: ReactNode; cache?: ContentCache }) {
  const { i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [session, dispatch] = useReducer(sessionReducer, INITIAL_SESSION);
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: ContentLoadResult } | null>(null);

  const active = session.seed !== null;
  const key = `${locale}:${String(reloadToken)}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void cache.get(locale).then((result) => {
      if (!cancelled) setLoaded({ key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [active, cache, key, locale]);

  const reloadContent = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const value = useMemo(() => {
    const content: ContentState = !active
      ? { status: "idle" }
      : loaded?.key !== key
        ? { status: "loading", locale }
        : loaded.result.ok
          ? { status: "ready", locale, content: loaded.result.content }
          : { status: "error", locale, error: loaded.result.error };
    return { session, dispatch, content, reloadContent };
  }, [active, key, loaded, locale, reloadContent, session]);
  return <QuizSessionContext value={value}>{children}</QuizSessionContext>;
}
