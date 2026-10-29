"use client";

import { pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { FileStack, List, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { flushSync } from "react-dom";
import { inputClass } from "@/components/kit";
import { onSheets, PrintFormatPicker, usePrintFormat } from "@/components/print/print-format";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { BillCombinedSheet } from "./bill-combined-a4";
import { BillSheet } from "./bill-print";
import { BillsListSheet } from "./bills-list-sheet";

/**
 * Printing several bills: "Print all" puts every bill on a page of its own (A4 or A5, as
 * picked), "Print as a list" puts them all in one A4 table, and "Print combined bill" puts
 * them on one A4 bill for one payer with one total. Only the chosen one is in the print job.
 */
export function BillsPrint({ invoices, today }: { invoices: InvoiceDetail[]; today: string }) {
  const t = useTranslations("Billing.printMany");
  const locale = useLocale() as Locale;
  const [mode, setMode] = useState<"bills" | "list" | "combined">("bills");
  // The setting is the society's, so every bill carries the same one. Never a roll for many bills.
  const choice = onSheets(invoices[0]!.print);
  const [format, setFormat] = usePrintFormat("bill", choice);
  // The combined bill goes to whoever the first bill is billed to, unless the office types another name.
  const first = invoices.find((invoice) => invoice.status !== "void") ?? invoices[0]!;
  const [payer, setPayer] = useState(() => pick(first.billTo.name, first.billTo.nameEn, locale));

  function print(next: typeof mode) {
    // Render the chosen layout before the browser takes its snapshot.
    flushSync(() => setMode(next));
    window.print();
  }

  return (
    <>
      <PrintFormatPicker choice={choice} value={format} onChange={setFormat} />
      <Button type="button" variant="outline" onClick={() => print("list")}>
        <List aria-hidden />
        {t("printList")}
      </Button>
      {invoices.length > 1 ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <input aria-label={t("combinedTo")} placeholder={t("combinedTo")} className={`${inputClass} sm:w-56!`} value={payer} onChange={(e) => setPayer(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => print("combined")}>
            <FileStack aria-hidden />
            {t("printCombined")}
          </Button>
        </span>
      ) : null}
      <Button type="button" onClick={() => print("bills")}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <PrintSheet>
        {mode === "list" ? (
          <BillsListSheet invoices={invoices} today={today} />
        ) : mode === "combined" ? (
          <BillCombinedSheet invoices={invoices} payer={payer.trim()} today={today} />
        ) : (
          invoices.map((invoice) => (
            <div key={invoice.id} className="print-page">
              <BillSheet invoice={invoice} format={format} />
            </div>
          ))
        )}
      </PrintSheet>
    </>
  );
}
