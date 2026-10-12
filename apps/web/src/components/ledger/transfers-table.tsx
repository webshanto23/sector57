import { formatDate, formatTaka, pick, type Locale, type Transfer } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Chip, DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** Transfers and deposits, newest first (cards on phones). */
export async function TransfersTable({ rows, locale, empty }: { rows: Transfer[]; locale: Locale; empty: string }) {
  const t = await getTranslations("Ledger.transfers");
  const tFunds = await getTranslations("Finance.funds");
  const side = (s: Transfer["from"], showFund: boolean) => (showFund ? `${pick(s.fund.nameBn, s.fund.nameEn, locale)} · ${tFunds(s.account)}` : tFunds(s.account));

  const columns: Column<Transfer>[] = [
    {
      key: "kind",
      header: t("col.kind"),
      cell: (row) => (
        <Link href={`/dashboard/ledger/transfers/${row.id}`} className="grid font-semibold text-fg">
          <span className={row.void ? "line-through" : ""}>{t(`kind.${row.kind}`)}</span>
          <span className="text-[12px] font-normal text-muted-foreground">{formatDate(row.date, locale, "short")}</span>
        </Link>
      ),
    },
    {
      key: "move",
      header: t("col.move"),
      // A deposit or withdrawal stays in one fund: name it once.
      cell: (row) => `${side(row.from, true)} → ${side(row.to, row.kind === "between_funds")}`,
    },
    { key: "memo", header: t("col.memo"), cell: (row) => row.memo ?? "—" },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => formatTaka(row.amount, locale) },
    { key: "status", header: t("col.status"), cell: (row) => (row.void ? <Chip>{t("void")}</Chip> : <Chip tone="good">{t("done")}</Chip>) },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("title")} empty={empty} />;
}
