import { canAnywhere, collectionQuery, formatNumber, formatTaka, type CollectionReport, type Locale } from "@s57/shared";
import { CircleCheck, Hourglass, Percent, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DataTable, Field, inputClass, ProgressBar, StatCard, type Column } from "@/components/kit";
import { canExportReport } from "@/components/reports/access";
import { AreaCrumbs } from "@/components/reports/area-crumbs";
import { ReportHeader } from "@/components/reports/report-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { csvHref, getCollection } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/collection">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.collection" });
  return { title: t("title") };
}

type Area = CollectionReport["areas"][number];

/** Billed against collected per area under a place, in the user's area; areas open to the next level down. */
export default async function CollectionPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/collection">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canAnywhere(me.access, "billing")) notFound();
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = collectionQuery.safeParse({ from: text("from"), to: text("to"), parentId: text("parentId") });
  const query = parsed.success ? parsed.data : {};
  const [t, tReports, tErrors, found] = await Promise.all([
    getTranslations("Reports.collection"),
    getTranslations("Reports"),
    getTranslations("Admin.errors"),
    getCollection(query),
  ]);
  const report = found ?? (await getCollection({}));
  if (!report) notFound();

  const money = (amount: string) => formatTaka(amount, locale);
  const pct = (value: number) => `${formatNumber(value, locale)}%`;
  const dates = { from: report.from, to: report.to };
  const drill = (id: string) => ({ pathname: "/dashboard/reports/collection", query: { ...dates, parentId: id } });

  const columns: Column<Area>[] = [
    {
      key: "area",
      header: t("col.area"),
      cell: (row) =>
        row.isUnit ? (
          <span className="font-semibold">{row.name}</span>
        ) : (
          <Link href={drill(row.id)} className="font-semibold text-primary">
            {row.name}
          </Link>
        ),
    },
    { key: "bills", header: t("col.bills"), numeric: true, cell: (row) => formatNumber(row.bills, locale) },
    { key: "billed", header: t("col.billed"), numeric: true, cell: (row) => money(row.billed) },
    { key: "collected", header: t("col.collected"), numeric: true, cell: (row) => money(row.collected) },
    { key: "outstanding", header: t("col.outstanding"), numeric: true, cell: (row) => money(row.outstanding) },
    {
      key: "percent",
      header: t("col.percent"),
      cell: (row) => (
        <span className="flex min-w-[120px] items-center gap-2">
          <ProgressBar value={row.percent} tone={row.percent >= 80 ? "good" : row.percent >= 50 ? "acc" : "warn"} label={row.name} className="flex-1" />
          <span className="num w-10 text-right text-[12.5px]">{pct(row.percent)}</span>
        </span>
      ),
    },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub")}
        csv={canExportReport(me.access, "collection") ? csvHref("collection", { ...dates, parentId: report.parent?.id, lang: locale }) : null}
      />

      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {report.parent ? <input type="hidden" name="parentId" value={report.parent.id} /> : null}
        <Field label={tReports("from")} htmlFor="collection-from">
          <input id="collection-from" type="date" name="from" defaultValue={report.from} className={`${inputClass} w-auto`} />
        </Field>
        <Field label={tReports("to")} htmlFor="collection-to">
          <input id="collection-to" type="date" name="to" defaultValue={report.to} className={`${inputClass} w-auto`} />
        </Field>
        <Button type="submit" variant="outline">
          {tReports("show")}
        </Button>
      </form>
      {!found ? (
        <div className="mb-3.5">
          <Note tone="warn">{tErrors("invalid_range")}</Note>
        </div>
      ) : null}

      <AreaCrumbs top={t("top")} topHref={{ pathname: "/dashboard/reports/collection", query: dates }} crumbs={report.crumbs} href={drill} label={t("title")} />

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <StatCard icon={Receipt} label={t("col.billed")} value={money(report.totals.billed)} note={formatNumber(report.totals.bills, locale)} />
        <StatCard icon={CircleCheck} tone="acc" label={t("col.collected")} value={money(report.totals.collected)} />
        <StatCard icon={Hourglass} tone="warn" label={t("col.outstanding")} value={money(report.totals.outstanding)} />
        <StatCard icon={Percent} tone="info" label={t("col.percent")} value={pct(report.totals.percent)} />
      </div>
      <DataTable columns={columns} rows={report.areas} rowKey={(row) => row.id} caption={t("title")} empty={t("empty")} />
    </>
  );
}
