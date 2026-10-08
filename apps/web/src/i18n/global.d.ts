import type bn from "@s57/shared/i18n/bn.json";
import type { routing } from "./routing";

// Typed message keys and locales for next-intl: `t("Common.save")` is checked.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof bn;
  }
}
