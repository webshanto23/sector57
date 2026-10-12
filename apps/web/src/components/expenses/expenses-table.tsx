import { formatDate, formatTaka, pick, type ExpenseRow, type ExpenseStatus, type Locale } from "@s57/shared";
import { Paperclip } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Chip, DataTable, type Column, type Tone } from "@/components/kit";
import { Link } from "@/i18n/navigation";

const STATUS_TONES: Record<ExpenseStatus, Tone> = { pending: "warn", approved: "info", rejected: "bad", paid: "good", void: "neutral" };

export async function ExpenseStatusChip({ status }: { status: ExpenseStatus }) {
  const t = await getTranslations("Expenses.status");
  return <Chip tone={STATUS_TONES[status]}>{t(status)}</Chip>;
}

/** Expenses as the mockup's table (cards on phones). */
export async function ExpensesTable({ rows, locale, empty, showFund }: { rows: ExpenseRow[]; locale: Locale; empty: string; showFund: boolean }) {
  const t = await getTranslations("Expenses.col");
  const columns: Column<ExpenseRow>[] = [
    {
      key: "expense",
      header: t("expense"),
      cell: (row) => (
        <Link href={`/dashboard/expenses/${row.id}`} className="grid font-semibold text-fg">
          <span className={row.status === "void" ? "line-through" : ""}>{row.description}</span>
          <span className="text-[12px] font-normal text-muted-foreground">
            {formatDate(row.spentOn, locale, "short")}
            {row.voucherNo ? <span className="font-mono"> · {row.voucherNo}</span> : null}
          </span>
        </Link>
      ),
    },
    { key: "head", header: t("head"), cell: (row) => pick(row.head.nameBn, row.head.nameEn, locale) },
    ...(showFund ? [{ key: "fund", header: t("fund"), cell: (row: ExpenseRow) => pick(row.fund.nameBn, row.fund.nameEn, locale) }] : []),
    { key: "vendor", header: t("vendor"), cell: (row) => row.vendor?.name ?? "—" },
    {
      key: "vouchers",
      header: t("vouchers"),
      cell: (row) =>
        row.vouchers ? (
          <span className="num inline-flex items-center gap-1">
            <Paperclip aria-hidden className="size-3.5" />
            {row.vouchers}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("noVoucher")}</span>
        ),
    },
    { key: "amount", header: t("amount"), numeric: true, cell: (row) => formatTaka(row.amount, locale) },
    { key: "status", header: t("status"), cell: (row) => <ExpenseStatusChip status={row.status} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("expense")} empty={empty} />;
}
