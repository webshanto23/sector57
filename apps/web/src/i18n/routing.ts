import { DEFAULT_LOCALE, LOCALES } from "@s57/shared";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Bangla lives at `/`, English at `/en/...`.
  localePrefix: "as-needed",
  // Bangla first: never redirect `/` to English because of the browser language.
  localeDetection: false,
});
