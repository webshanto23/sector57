import { compareMoney, formatDate, formatTaka, pick, type LedgerLink, type LedgerRow, type Locale } from "@s57/shared";
import { cn } from "cn";
import { getTranslations } from "next-intl/server";
import { Chip, DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";

const HREFS: Record<LedgerLink, (id: string) => string> = {
  receipt: (id) => `/dashboard/collect/receipts/${id}`,
  donation: (id) => `/dashboard/donations/${id}`,
  expense: (id) => `/dashboard/expenses/${id}`,
  transfer: (id) => `/dashboard/ledger/transfers/${id}`,
  fund: () => "/dashboard/settings/funds",
};

/**
 * A statement's rows, oldest first, with the running balance. Each row links to the record
 * that wrote it when the user may open that record (`links`).
 */
export async function LedgerTable({
  rows,
  locale,
  showFund,
  showAccount,
  links,
  empty,
}: {
  rows: LedgerRow[];
  locale: Locale;
  showFund: boolean;
  showAccount: boolean;
  links: Record<LedgerLink, boolean>;
  empty: string;
}) {
  const t = await getTranslations("Ledger");
  const tFunds = await getTranslations("Finance.funds");
  const money = (amount: string) => formatTaka(amount, locale);

  const entry = (row: LedgerRow) => {
    const label = (
      <span className="grid">
        <span className="font-semibold">{t(`source.${row.source}`)}</span>
        <span className="text-[12px] text-muted-foreground">
          {formatDate(row.date, locale, "short")}
          {row.reference ? <span className="font-mono"> · {row.reference}</span> : null}
        </span>
      </span>
    );
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {row.link && links[row.link.kind] ? (
          <Link href={HREFS[row.link.kind](row.link.id)} className="text-fg hover:text-primary">
            {label}
          </Link>
        ) : (
          label
        )}
        {row.reversal ? <Chip tone="warn">{t("reversal")}</Chip> : null}
        {row.reversed ? <Chip>{t("reversed")}</Chip> : null}
      </span>
    );
  };

  const columns: Column<LedgerRow>[] = [
    { key: "entry", header: t("col.entry"), cell: entry },
    ...(showFund ? [{ key: "fund", header: t("col.fund"), cell: (row: LedgerRow) => pick(row.fund.nameBn, row.fund.nameEn, locale) }] : []),
    ...(showAccount ? [{ key: "account", header: t("col.account"), cell: (row: LedgerRow) => tFunds(row.account) }] : []),
    { key: "in", header: t("col.in"), numeric: true, cell: (row) => (row.direction === "in" ? <span className="text-good">{money(row.amount)}</span> : "") },
    { key: "out", header: t("col.out"), numeric: true, cell: (row) => (row.direction === "out" ? money(row.amount) : "") },
    {
      key: "balance",
      header: t("col.balance"),
      numeric: true,
      cell: (row) => <span className={cn("font-semibold", compareMoney(row.balance, "0") < 0 && "text-bad")}>{money(row.balance)}</span>,
    },
    { key: "by", header: t("col.by"), cell: (row) => row.by ?? "—" },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("tabs.statement")} empty={empty} />;
}
