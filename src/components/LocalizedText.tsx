import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "../../shared/locales";

/**
 * Marks content shown in a fallback locale with its `lang` and a short hint
 * (docs/DECISIONS.md ADR-012).
 */
export function LocalizedText({ locale, children, as: Tag = "span" }: { locale: Locale | null; children: ReactNode; as?: "span" | "p" | "h2" | "legend" }) {
  const { t, i18n } = useTranslation();
  if (locale === null || locale === i18n.resolvedLanguage) {
    return <Tag>{children}</Tag>;
  }
  return (
    <Tag lang={locale}>
      {children} <small lang={i18n.resolvedLanguage}>{t("common.shownIn", { language: t(`language.names.${locale}`) })}</small>
    </Tag>
  );
}
