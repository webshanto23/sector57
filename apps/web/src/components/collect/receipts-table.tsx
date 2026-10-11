import { formatDate, formatTaka, pick, type Locale, type PaymentRow } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Chip, DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** Where a receipt's cash is: with the collector, handed over, confirmed, or void. */
export async function ReceiptStatusChip({ row }: { row: Pick<PaymentRow, "voided" | "handover"> }) {
  const t = await getTranslations("Collect.list.status");
  if (row.voided) return <Chip tone="neutral">{t("void")}</Chip>;
  if (!row.handover) return <Chip tone="warn">{t("inHand")}</Chip>;
  return row.handover.confirmed ? <Chip tone="good">{t("confirmed")}</Chip> : <Chip tone="info">{t("pending")}</Chip>;
}

/** Receipts as the mockup's table (cards on phones). */
export async function ReceiptsTable({
  rows,
  locale,
  empty,
  hide = [],
}: {
  rows: PaymentRow[];
  locale: Locale;
  empty: string;
  hide?: ("by" | "unit")[];
}) {
  const t = await getTranslations("Collect.list.col");
  const columns: Column<PaymentRow>[] = [
    {
      key: "receipt",
      header: t("receipt"),
      cell: (row) => (
        <Link href={`/dashboard/collect/receipts/${row.id}`} className="grid font-semibold text-fg">
          <span className={`font-mono text-[13px] ${row.voided ? "line-through" : ""}`}>{row.receiptNo}</span>
          <span className="text-[12px] font-normal text-muted-foreground">{formatDate(row.receivedAt, locale, "stamp")}</span>
        </Link>
      ),
    },
    { key: "payer", header: t("payer"), cell: (row) => pick(row.payer.name, row.payer.nameEn, locale) },
    ...(hide.includes("unit") ? [] : [{ key: "unit", header: t("unit"), cell: (row: PaymentRow) => row.payer.unit?.name ?? "—" }]),
    { key: "bills", header: t("bills"), cell: (row) => <span className="font-mono text-[12px]">{row.invoiceNos.join(", ")}</span> },
    ...(hide.includes("by") ? [] : [{ key: "by", header: t("by"), cell: (row: PaymentRow) => row.collectedBy.name }]),
    { key: "amount", header: t("amount"), numeric: true, cell: (row) => formatTaka(row.amount, locale) },
    { key: "status", header: t("status"), cell: (row) => <ReceiptStatusChip row={row} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("receipt")} empty={empty} />;
}
