import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/** Keeps `<html lang>` and the document title in sync with the active locale. */
export function DocumentMetadata() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const title = t("meta.title");

  useEffect(() => {
    if (language) {
      document.documentElement.lang = language;
    }
    document.title = title;
  }, [language, title]);

  return null;
}
