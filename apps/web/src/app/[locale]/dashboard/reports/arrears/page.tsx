import { arrearsQuery, canAnywhere, formatDate, formatNumber, formatTaka, localDigits, ARREARS_LIMIT, type ArrearsRow, type Locale } from "@s57/shared";
import { CalendarClock, Clock, Hourglass, House } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DataTable, StatCard, type Column } from "@/components/kit";
import { canExportReport } from "@/components/reports/access";
import { AreaCrumbs } from "@/components/reports/area-crumbs";
import { ArrearsPrint } from "@/components/reports/arrears-print";
import { ReportHeader } from "@/components/reports/report-header";
import { Link } from "@/i18n/navigation";
import { getBrand } from "@/lib/brand";
import { csvHref, getArrears } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/arrears">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.arrears" });
  return { title: t("title") };
}

/** Units with overdue bills in the user's area, aged; narrowed to a block or road, and printable as a door-to-door list. */
export default async function ArrearsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/arrears">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canAnywhere(me.access, "billing")) notFound();
  const search = await searchParams;
  const parsed = arrearsQuery.safeParse({ locationId: typeof search["locationId"] === "string" && search["locationId"] ? search["locationId"] : undefined });
  const query = parsed.success ? parsed.data : {};
  const [t, brand, found] = await Promise.all([getTranslations("Reports.arrears"), getBrand(locale), getArrears(query)]);
  const report = found ?? (await getArrears({}));
  if (!report) notFound();

  const money = (amount: string) => (amount === "0.00" ? <span className="text-muted-foreground">—</span> : formatTaka(amount, locale));
  const at = (id: string) => ({ pathname: "/dashboard/reports/arrears", query: { locationId: id } });
  const { totals } = report;
  const unitLinks = canAnywhere(me.access, "units");

  const columns: Column<ArrearsRow>[] = [
    {
      key: "unit",
      header: t("col.unit"),
      cell: (row) => {
        const label = (
          <>
            <span>
              {row.unit}
              {row.code ? <span className="font-normal text-muted-foreground"> · {row.code}</span> : null}
            </span>
            {row.address.length ? <span className="text-[12px] font-normal text-muted-foreground">{row.address.join(", ")}</span> : null}
          </>
        );
        return unitLinks ? (
          <Link href={`/dashboard/units/${row.unitId}`} className="grid font-semibold text-fg">
            {label}
          </Link>
        ) : (
          <span className="grid font-semibold">{label}</span>
        );
      },
    },
    {
      key: "billTo",
      header: t("col.billTo"),
      cell: (row) =>
        row.billTo ? (
          <span className="grid">
            {row.billTo.name}
            {row.billTo.phone ? <span className="text-[12px] text-muted-foreground">{row.billTo.phone}</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "bills", header: t("col.bills"), numeric: true, cell: (row) => formatNumber(row.bills, locale) },
    { key: "oldest", header: t("col.oldest"), cell: (row) => formatDate(row.oldestDue, locale, "short") },
    { key: "d30", header: t("d30"), numeric: true, cell: (row) => money(row.buckets.d30) },
    { key: "d90", header: t("d90"), numeric: true, cell: (row) => money(row.buckets.d90) },
    { key: "older", header: t("older"), numeric: true, cell: (row) => <span className="text-bad">{money(row.buckets.older)}</span> },
    { key: "owed", header: t("col.owed"), numeric: true, cell: (row) => <b>{formatTaka(row.owed, locale)}</b> },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub", { date: formatDate(report.asOf, locale) })}
        csv={canExportReport(me.access, "arrears") ? csvHref("arrears", { locationId: report.location?.id, lang: locale }) : null}
        actions={<ArrearsPrint report={report} society={brand.name} place={report.location?.name ?? null} />}
      />

      <AreaCrumbs top={t("everywhere")} topHref="/dashboard/reports/arrears" crumbs={report.crumbs} href={(id) => at(id)} label={t("title")} />
      {report.children.length ? (
        <nav aria-label={t("narrow")} className="mb-3.5 flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="text-muted-foreground">{t("narrow")}:</span>
          {report.children.map((child) => (
            <Link key={child.id} href={at(child.id)} className="rounded-full border border-line bg-surface px-3 py-1 font-semibold hover:border-primary">
              {child.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <StatCard icon={House} label={t("units")} value={formatNumber(totals.units, locale)} note={formatTaka(totals.owed, locale)} />
        <StatCard icon={Clock} tone="info" label={t("d30")} value={formatTaka(totals.d30, locale)} />
        <StatCard icon={Hourglass} tone="warn" label={t("d90")} value={formatTaka(totals.d90, locale)} />
        <StatCard icon={CalendarClock} tone="sun" label={t("older")} value={formatTaka(totals.older, locale)} />
      </div>
      {report.truncated ? (
        <div className="mb-3.5">
          <Note tone="warn">{t("truncated", { count: localDigits(ARREARS_LIMIT, locale) })}</Note>
        </div>
      ) : null}
      <DataTable columns={columns} rows={report.rows} rowKey={(row) => row.unitId} caption={t("title")} empty={t("empty")} />
    </>
  );
}
