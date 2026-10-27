"use client";

import { formatDate, pick, type DocumentHeader, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Kantha } from "@/components/kit";
import { PrintSheet } from "@/components/print/print-sheet";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";

const PAGE = "\u0001";
const PAGES = "\u0002";

/**
 * The page footer, "Printed 27 Oct 2026 · Page 1 of 2", in the bottom margin of every
 * `a4-landscape` page. Only CSS can count pages, so the words go into a page rule here.
 */
function footerRule(text: string, locale: Locale): string {
  const style = locale === "bn" ? "bengali" : "decimal";
  const parts = text.split(/(\u0001|\u0002)/).map((part) =>
    part === PAGE ? `counter(page, ${style})` : part === PAGES ? `counter(pages, ${style})` : JSON.stringify(part),
  );
  return `@media print { @page a4-landscape { @bottom-left { content: ${parts.join(" ")}; } } }`;
}

/**
 * The register on A4 landscape (mockup `sector57-collection-register-a4.png`): the society's
 * band, what is shown, the table (`children`, the server-rendered `RegisterGrid`) and the
 * signature lines.
 */
export function RegisterPrint({ header, filters, children }: { header: DocumentHeader; filters: string; children: ReactNode }) {
  const t = useTranslations("Reports.collectionRegister");
  const locale = useLocale() as Locale;
  const address = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;
  const footer = `${t("printed", { date: formatDate(new Date(), locale, "short") })} · ${t("printPage", { page: PAGE, pages: PAGES })}`;

  return (
    <>
      <Button type="button" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("printButton")}
      </Button>
      <PrintSheet>
        <style>{footerRule(footer, locale)}</style>
        <div className="print-a4-landscape">
          <header className="flex items-center justify-between gap-[6mm] bg-accent px-[5mm] py-[4mm] text-primary">
            <div className="flex items-center gap-[3mm]">
              <Logo mark={header.mark} size="lg" />
              <div>
                <p className="text-[15pt] leading-tight font-bold">{pick(header.nameBn, header.nameEn, locale)}</p>
                {address ? <p className="mt-[1mm] text-[9.5pt]">{address}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[14pt] font-bold tracking-[0.08em] uppercase">{t("printTitle")}</p>
              <p className="mt-[1mm] text-[9.5pt] text-muted-foreground">{filters}</p>
            </div>
          </header>
          <Kantha className="mb-[4mm]" />
          {children}
          <div className="print-break-avoid mt-[16mm] ml-auto grid w-[60%] grid-cols-3 gap-[10mm] text-center text-[9pt] text-muted-foreground">
            {(["collector", "treasurer", "secretary"] as const).map((who) => (
              <p key={who} className="border-t border-muted-foreground pt-[1.5mm]">
                {t(`sign.${who}`)}
              </p>
            ))}
          </div>
        </div>
      </PrintSheet>
    </>
  );
}
