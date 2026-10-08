import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const messages = {
  bn: () => import("@s57/shared/i18n/bn.json").then((m) => m.default),
  en: () => import("@s57/shared/i18n/en.json").then((m) => m.default),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await messages[locale]() };
});
