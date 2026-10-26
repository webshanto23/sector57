"use client";

import { formatNumber, type Locale, type PaymentDetail } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { FormStatus, type Status } from "@/components/admin/form-status";
import { PrintFormatPicker, usePrintFormat } from "@/components/print/print-format";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { donationLine, Receipt, receiptOf } from "./receipt";
import { ReceiptThermal } from "./receipt-thermal";

/**
 * Prints the receipt on A5 with its office counterfoil, or on an 80 mm thermal roll, as the
 * society offers and this device last picked. Each print is counted first: the
 * first is the original, every later one says "Duplicate". `autoPrint` (right after saving)
 * prints once without a click.
 */
export function ReceiptPrint({ payment, autoPrint, donationId }: { payment: PaymentDetail; autoPrint: boolean; donationId?: string }) {
  const t = useTranslations("Collect.detail");
  const tReceipt = useTranslations("Collect.receipt");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [mark, setMark] = useState<"duplicate" | null>(payment.printCount > 0 ? "duplicate" : null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [format, setFormat] = usePrintFormat("receipt", payment.print);

  async function print() {
    setBusy(true);
    setStatus(null);
    try {
      // A donation's page counts through the donation (it needs `donations.view`, not `payments.view`).
      const { data, response } = donationId
        ? await api.POST("/donations/{id}/print", { params: { path: { id: donationId } } })
        : await api.POST("/payments/{id}/print", { params: { path: { id: payment.id } } });
      if (!response.ok || !data) {
        setStatus({ ok: false, text: tAll("Common.error") });
        return;
      }
      // Draw the right copy before the print dialog takes its snapshot.
      flushSync(() => setMark(data.copy === "duplicate" ? "duplicate" : null));
      window.print();
      setMark("duplicate");
      router.refresh();
    } catch {
      setStatus({ ok: false, text: tAll("Admin.errors.network") });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoPrint) return;
    // Once the page has drawn; the cleanup keeps a re-run from printing twice.
    const timer = setTimeout(() => {
      // A reload of this page must not print again.
      router.replace(pathname);
      if (payment.printCount === 0 && !payment.voided) void print();
    }, 0);
    return () => clearTimeout(timer);
    // Only on the first render after saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = receiptOf(payment, locale, mark, (purpose) => donationLine(tReceipt, purpose));

  return (
    <div className="grid gap-2">
      <PrintFormatPicker choice={payment.print} value={format} onChange={setFormat} />
      <Button type="button" onClick={() => void print()} disabled={busy}>
        <Printer aria-hidden />
        {payment.printCount === 0 ? t("print") : t("reprint")}
      </Button>
      <p className="num text-[12.5px] text-muted-foreground">
        {payment.printCount === 0 ? t("notPrinted") : t("printed", { count: formatNumber(payment.printCount, locale) })}
      </p>
      <FormStatus status={status} />
      <PrintSheet>
        {format === "thermal80" ? (
          <ReceiptThermal data={data} locale={locale} />
        ) : (
          <Receipt data={data} locale={locale} print />
        )}
      </PrintSheet>
    </div>
  );
}
