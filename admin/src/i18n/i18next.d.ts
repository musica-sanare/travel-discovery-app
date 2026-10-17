import "i18next";
import type { AdminMessages } from "./messages/ja";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: AdminMessages };
  }
}
