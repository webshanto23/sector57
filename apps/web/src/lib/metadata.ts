import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";

/** Canonical URL plus `hreflang` links between the Bangla and English versions of a page. */
export function alternates(href: string, locale: Locale): Metadata["alternates"] {
  const bn = getPathname({ href, locale: "bn" });
  return {
    canonical: getPathname({ href, locale }),
    languages: { bn, en: getPathname({ href, locale: "en" }), "x-default": bn },
  };
}
