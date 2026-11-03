import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Keeps `<html lang>`, the document title, and, when given, the description in
 * sync with the active locale. The Open Graph tags in index.html stay in the
 * default locale.
 */
export function DocumentMetadata({ description }: { description?: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const title = t("meta.title");

  useEffect(() => {
    if (language) {
      document.documentElement.lang = language;
    }
    document.title = title;
    if (description !== undefined) {
      document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    }
  }, [language, title, description]);

  return null;
}
