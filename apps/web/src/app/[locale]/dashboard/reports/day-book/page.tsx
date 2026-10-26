import { addDays, dayBookQuery, formatDate, formatTaka, pick, type DayBook, type Locale } from "@s57/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Card, Chip, DataTable, Field, inputClass, type Column } from "@/components/kit";
import { canExportReport, canSeeReport } from "@/components/reports/access";
import { ReportHeader } from "@/components/reports/report-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { csvHref, getDayBook } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/day-book">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.dayBook" });
  return { title: t("title") };
}

type Receipt = NonNullable<DayBook["receipts"]>["items"][number];
type Donation = NonNullable<DayBook["donations"]>["items"][number];
type Expense = NonNullable<DayBook["expenses"]>["items"][number];
type TransferLine = NonNullable<DayBook["transfers"]>["items"][number];
type FundDay = NonNullable<DayBook["funds"]>[number];

/** One day's money: cash per collector, then each section the user may see. */
export default async function DayBookPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/day-book">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canSeeReport(me.access, "day-book")) notFound();
  const search = await searchParams;
  const parsed = dayBookQuery.safeParse({ date: typeof search["date"] === "string" && search["date"] ? search["date"] : undefined });
  const date = parsed.success ? parsed.data.date : undefined;
  const [t, tReports, tFunds, found] = await Promise.all([
    getTranslations("Reports.dayBook"),
    getTranslations("Reports"),
    getTranslations("Finance.funds"),
    getDayBook(date),
  ]);
  const book = found ?? (await getDayBook());
  if (!book) notFound();

  const today = todayInDhaka();
  const money = (amount: string) => formatTaka(amount, locale);
  const time = (iso: string) => formatDate(iso, locale, "time");
  const name = (ref: { nameBn: string; nameEn: string | null }) => pick(ref.nameBn, ref.nameEn, locale);
  const voided = (isVoid: boolean, node: ReactNode) =>
    isVoid ? (
      <span className="inline-flex items-center gap-2">
        <span className="text-muted-foreground line-through">{node}</span>
        <Chip>{t("voidMark")}</Chip>
      </span>
    ) : (
      node
    );
  const section = (title: string, total: string | null, table: ReactNode) => (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px]">{title}</h2>
        {total !== null ? <span className="num text-[13.5px] text-muted-foreground">{t("total", { amount: money(total) })}</span> : null}
      </div>
      {table}
    </section>
  );

  const receiptColumns: Column<Receipt>[] = [
    {
      key: "no",
      header: t("col.no"),
      cell: (row) => voided(row.void, <Link href={`/dashboard/collect/receipts/${row.id}`} className="font-mono font-semibold text-fg">{row.receiptNo}</Link>),
    },
    { key: "time", header: t("col.time"), cell: (row) => time(row.at) },
    { key: "payer", header: t("col.payer"), cell: (row) => row.payer ?? "—" },
    { key: "unit", header: t("col.unit"), cell: (row) => row.unit?.join(", ") ?? "—" },
    { key: "collector", header: t("col.collector"), cell: (row) => row.collector.name },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => voided(row.void, money(row.amount)) },
  ];
  const donationColumns: Column<Donation>[] = [
    {
      key: "no",
      header: t("col.no"),
      cell: (row) => voided(row.void, <Link href={`/dashboard/donations/${row.donationId}`} className="font-mono font-semibold text-fg">{row.receiptNo}</Link>),
    },
    { key: "time", header: t("col.time"), cell: (row) => time(row.at) },
    { key: "payer", header: t("col.payer"), cell: (row) => row.payer ?? t("anonymous") },
    { key: "fund", header: t("col.fund"), cell: (row) => name(row.fund) },
    { key: "purpose", header: t("col.purpose"), cell: (row) => row.purpose ?? "—" },
    { key: "collector", header: t("col.collector"), cell: (row) => row.collector.name },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => voided(row.void, money(row.amount)) },
  ];
  const expenseColumns: Column<Expense>[] = [
    {
      key: "no",
      header: t("col.no"),
      cell: (row) => voided(row.void, <Link href={`/dashboard/expenses/${row.id}`} className="font-mono font-semibold text-fg">{row.voucherNo}</Link>),
    },
    { key: "head", header: t("col.head"), cell: (row) => name(row.head) },
    { key: "for", header: t("col.for"), cell: (row) => <span className="whitespace-normal">{row.description}</span> },
    { key: "account", header: t("col.account"), cell: (row) => tFunds(row.account) },
    { key: "paidBy", header: t("col.paidBy"), cell: (row) => row.paidBy ?? "—" },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => voided(row.void, money(row.amount)) },
  ];
  const transferColumns: Column<TransferLine>[] = [
    {
      key: "move",
      header: t("col.move"),
      cell: (row) =>
        voided(
          row.void,
          <Link href={`/dashboard/ledger/transfers/${row.id}`} className="font-semibold text-fg">
            {`${name(row.from.fund)} · ${tFunds(row.from.account)} → ${name(row.to.fund)} · ${tFunds(row.to.account)}`}
          </Link>,
        ),
    },
    { key: "memo", header: t("col.memo"), cell: (row) => row.memo ?? "—" },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (row) => money(row.amount) },
  ];
  const fundColumns: Column<FundDay>[] = [
    { key: "fund", header: t("col.fund"), cell: (row) => `${name(row.fund)} · ${tFunds(row.account)}` },
    { key: "opening", header: t("col.opening"), numeric: true, cell: (row) => money(row.opening) },
    { key: "in", header: t("col.in"), numeric: true, cell: (row) => money(row.in) },
    { key: "out", header: t("col.out"), numeric: true, cell: (row) => money(row.out) },
    { key: "closing", header: t("col.closing"), numeric: true, cell: (row) => <b>{money(row.closing)}</b> },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={formatDate(book.date, locale)}
        csv={canExportReport(me.access, "day-book") ? csvHref("day-book", { date: book.date, lang: locale }) : null}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2.5">
        <Link href={{ pathname: "/dashboard/reports/day-book", query: { date: addDays(book.date, -1) } }} className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft aria-hidden />
          {t("previous")}
        </Link>
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <Field label={t("date")} htmlFor="day-book-date">
            <input id="day-book-date" type="date" name="date" defaultValue={book.date} max={today} className={`${inputClass} sm:w-auto!`} />
          </Field>
          <Button type="submit" variant="outline">
            {tReports("show")}
          </Button>
        </form>
        {book.date < today ? (
          <Link href={{ pathname: "/dashboard/reports/day-book", query: { date: addDays(book.date, 1) } }} className={buttonVariants({ variant: "outline" })}>
            {t("next")}
            <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5">
        <Card className="grid gap-2">
          <h2 className="text-[15px]">{t("byCollector")}</h2>
          {book.byCollector.length ? (
            <ul className="grid gap-1.5 text-[13.5px]">
              {book.byCollector.map((row) => (
                <li key={row.collector.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {row.collector.name} <span className="text-muted-foreground">· {t("receiptsCount", { count: row.receipts })}</span>
                  </span>
                  <b className="num">{money(row.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{t("noCash")}</p>
          )}
        </Card>

        {book.receipts
          ? section(t("receipts"), book.receipts.total, <DataTable columns={receiptColumns} rows={book.receipts.items} rowKey={(row) => row.id} caption={t("receipts")} empty={t("empty")} />)
          : null}
        {book.donations
          ? section(t("donations"), book.donations.total, <DataTable columns={donationColumns} rows={book.donations.items} rowKey={(row) => row.id} caption={t("donations")} empty={t("empty")} />)
          : null}
        {book.expenses
          ? section(t("expenses"), book.expenses.total, <DataTable columns={expenseColumns} rows={book.expenses.items} rowKey={(row) => row.id} caption={t("expenses")} empty={t("empty")} />)
          : null}
        {book.transfers
          ? section(t("transfers"), null, <DataTable columns={transferColumns} rows={book.transfers.items} rowKey={(row) => row.id} caption={t("transfers")} empty={t("empty")} />)
          : null}
        {book.funds
          ? section(t("funds"), null, <DataTable columns={fundColumns} rows={book.funds} rowKey={(row) => `${row.fund.id}-${row.account}`} caption={t("funds")} empty={t("empty")} />)
          : null}
      </div>
    </>
  );
}
