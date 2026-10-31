import type { Locale } from "../../../shared/locales";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { ja, type AdminMessages } from "./messages/ja";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
} as const satisfies Record<Locale, { translation: AdminMessages }>;
