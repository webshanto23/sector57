"use client";

import { type InvoiceDetail, type PrintFormat } from "@s57/shared";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { PrintFormatPicker, usePrintFormat } from "@/components/print/print-format";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { BillA4Sheet } from "./bill-a4";
import { BillA5Sheet } from "./bill-a5";

/**
 * "Print bill" with the paper picker: A4 or A5, as the society offers, remembered on this
 * device. A void bill prints with a large "Void". Follows the page language.
 */
export function BillPrint({ invoice }: { invoice: InvoiceDetail }) {
  const tBilling = useTranslations("Billing");
  const [format, setFormat] = usePrintFormat("bill", invoice.print);

  return (
    <>
      <PrintFormatPicker choice={invoice.print} value={format} onChange={setFormat} />
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {tBilling("detail.print")}
      </Button>
      <PrintSheet>
        <BillSheet invoice={invoice} format={format} />
      </PrintSheet>
    </>
  );
}

/** The bill itself on the chosen paper; also used to print several bills together. */
export function BillSheet({ invoice, format }: { invoice: InvoiceDetail; format: PrintFormat }) {
  return format === "a4" ? <BillA4Sheet invoice={invoice} /> : <BillA5Sheet invoice={invoice} />;
}
