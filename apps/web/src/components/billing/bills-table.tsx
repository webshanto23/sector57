import { formatDate, formatTaka, pick, type InvoiceRow, type Locale } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";
import { billToLabel, InvoiceStatusChip, periodLabel, unitLabel } from "./labels";

/**
 * Bills as the mockup's table (cards on phones). `hide` drops the columns a unit or
 * person page already shows.
 */
export async function BillsTable({
  rows,
  locale,
  empty,
  hide = [],
  selectForm,
}: {
  rows: InvoiceRow[];
  locale: Locale;
  empty: string;
  hide?: ("unit" | "billTo")[];
  /**
   * With a form id, each bill gets a tick box that joins that form (printing several bills,
   * or taking payment for them). The box carries the bill's account and whether it is open.
   */
  selectForm?: string;
}) {
  const t = await getTranslations("Billing");
  const tPrint = await getTranslations("Billing.printMany");
  const tr = t as unknown as (key: string, values?: Record<string, string>) => string;
  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice",
      header: t("col.invoice"),
      cell: (row) => (
        <span className="flex items-start gap-2.5">
          {selectForm ? (
            <input
              type="checkbox"
              form={selectForm}
              name="id"
              value={row.id}
              data-account={row.billTo.unit ? `unitId:${row.billTo.unit.id}` : `${row.billTo.kind}Id:${row.billTo.id}`}
              data-open={row.status === "unpaid" || row.status === "partial" ? "1" : undefined}
              aria-label={tPrint("select", { no: row.invoiceNo })}
              className="mt-1 size-4 accent-primary"
            />
          ) : null}
          <Link href={`/dashboard/billing/${row.id}`} className="grid font-semibold text-fg">
            <span className="font-mono text-[13px]">{row.invoiceNo}</span>
            <span className="text-[12px] font-normal text-muted-foreground">{formatDate(row.issueDate, locale, "short")}</span>
          </Link>
        </span>
      ),
    },
    ...(hide.includes("unit")
      ? []
      : [{ key: "unit", header: t("col.unit"), cell: (row: InvoiceRow) => unitLabel(row.billTo) ?? <span className="text-muted-foreground">{t("noUnit")}</span> }]),
    ...(hide.includes("billTo") ? [] : [{ key: "billTo", header: t("col.billTo"), cell: (row: InvoiceRow) => billToLabel(row.billTo, locale, tr) }]),
    {
      key: "charge",
      header: t("col.charge"),
      cell: (row) =>
        row.kind === "opening" ? t("kind.opening") : row.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", "),
    },
    { key: "period", header: t("col.period"), cell: (row) => periodLabel(row, locale, tr) ?? "—" },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => formatTaka(row.total, locale) },
    { key: "status", header: t("col.status"), cell: (row) => <InvoiceStatusChip row={row} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("col.invoice")} empty={empty} />;
}
