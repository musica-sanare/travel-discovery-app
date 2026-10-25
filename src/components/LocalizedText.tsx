import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "../../shared/locales";

/**
 * Marks content shown in a fallback locale with its `lang` and a short hint
 * (docs/working/DECISIONS.md ADR-012).
 */
export function LocalizedText({
  locale,
  children,
  as: Tag = "span",
  className,
}: {
  locale: Locale | null;
  children: ReactNode;
  as?: "span" | "p" | "h2" | "legend";
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  if (locale === null || locale === i18n.resolvedLanguage) {
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <Tag lang={locale} className={className}>
      {children}{" "}
      <small lang={i18n.resolvedLanguage} className="text-xs font-normal text-muted">
        {t("common.shownIn", { language: t(`language.names.${locale}`) })}
      </small>
    </Tag>
  );
}
