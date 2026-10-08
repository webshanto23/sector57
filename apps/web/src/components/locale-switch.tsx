"use client";

import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";

/** Links to the same page in the other language. */
export function LocaleSwitch() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "bn" ? "en" : "bn";

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      className={buttonVariants({ variant: "outline", size: "pill" })}
      aria-label={t("language")}
    >
      {other === "en" ? t("switchToEnglish") : t("switchToBangla")}
    </Link>
  );
}
