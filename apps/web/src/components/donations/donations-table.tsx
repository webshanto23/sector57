import { formatDate, formatTaka, pick, type DonationRow, type Locale } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Chip, DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** Donations as the mockup's table (cards on phones). `hide` drops columns a panel already implies. */
export async function DonationsTable({
  rows,
  locale,
  empty,
  showFund,
  hide = [],
}: {
  rows: DonationRow[];
  locale: Locale;
  empty: string;
  /** Only while the society keeps separate funds. */
  showFund: boolean;
  hide?: ("donor" | "by")[];
}) {
  const t = await getTranslations("Donations");
  const tReceipt = await getTranslations("Collect.receipt");
  const columns: Column<DonationRow>[] = [
    {
      key: "receipt",
      header: t("col.receipt"),
      cell: (row) => (
        <Link href={`/dashboard/donations/${row.id}`} className="grid font-semibold text-fg">
          <span className={`font-mono text-[13px] ${row.voided ? "line-through" : ""}`}>{row.receiptNo}</span>
          <span className="text-[12px] font-normal text-muted-foreground">{formatDate(row.receivedAt, locale, "stamp")}</span>
        </Link>
      ),
    },
    ...(hide.includes("donor")
      ? []
      : [
          {
            key: "donor",
            header: t("col.donor"),
            cell: (row: DonationRow) =>
              row.donor ? pick(row.donor.name, row.donor.nameEn, locale) : <span className="text-muted-foreground">{tReceipt("anonymous")}</span>,
          },
        ]),
    { key: "purpose", header: t("col.purpose"), cell: (row) => row.purpose ?? "—" },
    ...(showFund ? [{ key: "fund", header: t("col.fund"), cell: (row: DonationRow) => pick(row.fund.nameBn, row.fund.nameEn, locale) }] : []),
    ...(hide.includes("by") ? [] : [{ key: "by", header: t("col.by"), cell: (row: DonationRow) => row.collectedBy.name }]),
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => formatTaka(row.amount, locale) },
    {
      key: "status",
      header: t("col.status"),
      cell: (row) => (row.voided ? <Chip tone="neutral">{t("status.void")}</Chip> : <Chip tone="good">{t("status.valid")}</Chip>),
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("col.receipt")} empty={empty} />;
}
