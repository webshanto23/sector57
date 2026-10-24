import { canAnywhere, formatNumber, occupancyQuery, type Locale, type OccupancyReport } from "@s57/shared";
import { Building2, DoorOpen, Home, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Chip, DataTable, ProgressBar, StatCard, type Column, type Tone } from "@/components/kit";
import { canExportReport } from "@/components/reports/access";
import { AreaCrumbs } from "@/components/reports/area-crumbs";
import { ReportHeader } from "@/components/reports/report-header";
import { Link } from "@/i18n/navigation";
import { csvHref, getOccupancy } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/occupancy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.occupancy" });
  return { title: t("title") };
}

type Area = OccupancyReport["areas"][number];

const OCCUPANCY_TONES: Record<NonNullable<Area["occupancy"]>, Tone> = { owner_occupied: "good", rented: "info", vacant: "warn" };

/** Active units by occupancy per area under a place, in the user's area; areas open to the next level down. */
export default async function OccupancyPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/occupancy">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canAnywhere(me.access, "units")) notFound();
  const search = await searchParams;
  const parsed = occupancyQuery.safeParse({ parentId: typeof search["parentId"] === "string" ? search["parentId"] : undefined });
  const [t, found] = await Promise.all([getTranslations("Reports.occupancy"), getOccupancy(parsed.success ? parsed.data : {})]);
  const report = found ?? (await getOccupancy({}));
  if (!report) notFound();

  const count = (value: number) => formatNumber(value, locale);
  const drill = (id: string) => ({ pathname: "/dashboard/reports/occupancy", query: { parentId: id } });

  const columns: Column<Area>[] = [
    {
      key: "area",
      header: t("col.area"),
      cell: (row) =>
        row.isUnit ? (
          <Link href={`/dashboard/units/${row.id}`} className="font-semibold text-fg">
            {row.name}
          </Link>
        ) : (
          <Link href={drill(row.id)} className="font-semibold text-primary">
            {row.name}
          </Link>
        ),
    },
    { key: "units", header: t("col.units"), numeric: true, cell: (row) => count(row.units) },
    { key: "ownerOccupied", header: t("col.ownerOccupied"), numeric: true, cell: (row) => count(row.ownerOccupied) },
    { key: "rented", header: t("col.rented"), numeric: true, cell: (row) => count(row.rented) },
    { key: "vacant", header: t("col.vacant"), numeric: true, cell: (row) => count(row.vacant) },
    {
      key: "percent",
      header: t("col.percent"),
      cell: (row) =>
        row.isUnit && row.occupancy ? (
          <Chip tone={OCCUPANCY_TONES[row.occupancy]}>{t(`occupancy.${row.occupancy}`)}</Chip>
        ) : (
          <span className="flex min-w-[120px] items-center gap-2">
            <ProgressBar value={row.occupiedPercent} tone={row.occupiedPercent >= 80 ? "good" : "acc"} label={row.name} className="flex-1" />
            <span className="num w-10 text-right text-[12.5px]">{count(row.occupiedPercent)}%</span>
          </span>
        ),
    },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub")}
        csv={canExportReport(me.access, "occupancy") ? csvHref("occupancy", { parentId: report.parent?.id, lang: locale }) : null}
      />

      <AreaCrumbs top={t("top")} topHref="/dashboard/reports/occupancy" crumbs={report.crumbs} href={drill} label={t("title")} />

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <StatCard icon={Building2} label={t("col.units")} value={count(report.totals.units)} note={`${count(report.totals.occupiedPercent)}% ${t("occupied")}`} />
        <StatCard icon={Home} tone="acc" label={t("col.ownerOccupied")} value={count(report.totals.ownerOccupied)} />
        <StatCard icon={KeyRound} tone="info" label={t("col.rented")} value={count(report.totals.rented)} />
        <StatCard icon={DoorOpen} tone="warn" label={t("col.vacant")} value={count(report.totals.vacant)} />
      </div>
      <DataTable columns={columns} rows={report.areas} rowKey={(row) => row.id} caption={t("title")} empty={t("empty")} />
    </>
  );
}
