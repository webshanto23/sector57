"use client";

import { type InvoiceDetail } from "@s57/shared";
import { List, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { flushSync } from "react-dom";
import { onSheets, PrintFormatPicker, usePrintFormat } from "@/components/print/print-format";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { BillSheet } from "./bill-print";
import { BillsListSheet } from "./bills-list-sheet";

/**
 * Printing several bills: "Print all" puts every bill on a page of its own (A4 or A5, as
 * picked), "Print as a list" puts them all in one A4 table. Only the chosen one is in the print job.
 */
export function BillsPrint({ invoices, today }: { invoices: InvoiceDetail[]; today: string }) {
  const t = useTranslations("Billing.printMany");
  const [mode, setMode] = useState<"bills" | "list">("bills");
  // The setting is the society's, so every bill carries the same one. Never a roll for many bills.
  const choice = onSheets(invoices[0]!.print);
  const [format, setFormat] = usePrintFormat("bill", choice);

  function print(next: "bills" | "list") {
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
      <Button type="button" onClick={() => print("bills")}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <PrintSheet>
        {mode === "list" ? (
          <BillsListSheet invoices={invoices} today={today} />
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
