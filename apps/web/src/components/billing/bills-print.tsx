"use client";

import { type InvoiceDetail } from "@s57/shared";
import { List, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { flushSync } from "react-dom";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { BillSheet } from "./bill-print";
import { BillsListSheet } from "./bills-list-sheet";

/**
 * Printing several bills: "Print all" puts every bill on a page of its own (A5), "Print as a
 * list" puts them all in one A4 table. Only the chosen one is in the print job.
 */
export function BillsPrint({ invoices, today }: { invoices: InvoiceDetail[]; today: string }) {
  const t = useTranslations("Billing.printMany");
  const [mode, setMode] = useState<"bills" | "list">("bills");

  function print(next: "bills" | "list") {
    // Render the chosen layout before the browser takes its snapshot.
    flushSync(() => setMode(next));
    window.print();
  }

  return (
    <>
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
              <BillSheet invoice={invoice} />
            </div>
          ))
        )}
      </PrintSheet>
    </>
  );
}
