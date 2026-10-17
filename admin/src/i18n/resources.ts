import type { Locale } from "../../../shared/locales";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { ja, type AdminMessages } from "./messages/ja";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
  es: { translation: es },
} as const satisfies Record<Locale, { translation: AdminMessages }>;
