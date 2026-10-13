"use client";

import { amountInWords, pick, type Locale, type PayslipSheet } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DocumentHead, Stamp } from "@/components/print/document-head";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { PayslipBody } from "./payslip-body";

/** The payslip on A5: the society's header, the figures, the net in words and lines to sign. A void run prints "Void". */
export function PayslipPrint({ sheet }: { sheet: PayslipSheet }) {
  const t = useTranslations("Payroll.payslip");
  const locale = useLocale() as Locale;
  const { payslip } = sheet;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <PrintSheet>
        <div className="print-break-avoid relative overflow-hidden rounded-[8px] border border-line">
          <DocumentHead header={sheet.header} locale={locale} title={t("title")} />
          <div className="grid gap-2.5 px-4 py-3.5 text-[13px]">
            <b className="text-[14px]">{pick(payslip.staff.name, payslip.staff.nameEn, locale)}</b>
            <PayslipBody sheet={sheet} locale={locale} />
            <p className="border-y border-dashed border-line py-2 font-semibold">{t("words", { words: amountInWords(payslip.net, locale) })}</p>
            <div className="grid grid-cols-3 gap-3 pt-8 text-center text-[11.5px] text-muted-foreground">
              <span className="border-t border-line pt-1">{t("prepared")}</span>
              <span className="border-t border-line pt-1">{t("approvedBy")}</span>
              <span className="border-t border-line pt-1">{t("received")}</span>
            </div>
          </div>
          {sheet.status === "void" ? <Stamp text={t("void")} tone="bad" /> : null}
        </div>
      </PrintSheet>
    </>
  );
}
