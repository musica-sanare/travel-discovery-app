import type { Locale } from "./locales";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { ja, type Messages } from "./messages/ja";

export const DEFAULT_NAMESPACE = "translation";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
  es: { translation: es },
} as const satisfies Record<Locale, { translation: Messages }>;
