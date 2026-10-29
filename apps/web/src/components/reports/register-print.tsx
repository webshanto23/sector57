"use client";

import { pick, type DocumentHeader, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ReportPrint } from "./report-print";

/**
 * The register on A4 landscape (mockup `sector57-collection-register-a4.png`): the society's
 * band from the receipt header, what is shown, the table (`children`, the server-rendered
 * `RegisterGrid`) and the signature lines.
 */
export function RegisterPrint({ header, filters, children }: { header: DocumentHeader; filters: string; children: ReactNode }) {
  const t = useTranslations("Reports.collectionRegister");
  const locale = useLocale() as Locale;
  const place = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;

  return (
    <ReportPrint
      page="a4-landscape"
      band={{ name: pick(header.nameBn, header.nameEn, locale), mark: header.mark, place }}
      title={t("printTitle")}
      sub={filters}
      signatures={[t("sign.collector"), t("sign.treasurer"), t("sign.secretary")]}
    >
      {children}
    </ReportPrint>
  );
}
