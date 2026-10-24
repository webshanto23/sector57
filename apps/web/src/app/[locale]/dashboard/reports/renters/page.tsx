import { canAnywhere, formatDate, formatNumber, pick, rentersReportQuery, type Locale, type RentersReport } from "@s57/shared";
import { ClipboardList, FileWarning, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Chip, DataTable, StatCard, type Column } from "@/components/kit";
import { ReportHeader } from "@/components/reports/report-header";
import { RentersPrint } from "@/components/reports/renters-print";
import { Link } from "@/i18n/navigation";
import { getBrand } from "@/lib/brand";
import { csvHref, getRenters } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/renters">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.renters" });
  return { title: t("title") };
}

type Row = RentersReport["rows"][number];

/** Current renters for the police station, in the user's export area; only while the society shares it. */
export default async function RentersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/renters">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canAnywhere(me.access, "members", "export")) notFound();
  const search = await searchParams;
  const parsed = rentersReportQuery.safeParse({ locationId: typeof search["locationId"] === "string" ? search["locationId"] : undefined });
  const [t, brand, found] = await Promise.all([getTranslations("Reports.renters"), getBrand(locale), getRenters(parsed.success ? parsed.data : {})]);
  const report = found === null ? await getRenters({}) : found;
  if (!report) notFound();

  if (report === "off") {
    return (
      <>
        <ReportHeader title={t("title")} sub={t("sub")} />
        <Note tone="warn">{t("off")}</Note>
      </>
    );
  }

  const count = (value: number) => formatNumber(value, locale);
  const personLinks = canAnywhere(me.access, "members");
  const columns: Column<Row>[] = [
    {
      key: "unit",
      header: t("col.unit"),
      cell: (row) => (
        <span className="grid">
          <b>{row.unit}</b>
          {row.address.length ? <span className="text-[12.5px] text-muted-foreground">{row.address.join(", ")}</span> : null}
        </span>
      ),
    },
    {
      key: "renter",
      header: t("col.renter"),
      cell: (row) => (
        <span className="grid">
          {personLinks ? (
            <Link
              href={row.renter.kind === "person" ? `/dashboard/members/${row.renter.id}` : `/dashboard/members/organisations/${row.renter.id}`}
              className="font-semibold text-fg"
            >
              {pick(row.renter.name, row.renter.nameEn, locale)}
            </Link>
          ) : (
            <b>{pick(row.renter.name, row.renter.nameEn, locale)}</b>
          )}
          {row.phone ? <span className="num text-[12.5px] text-muted-foreground">{row.phone}</span> : null}
        </span>
      ),
    },
    {
      key: "type",
      header: t("col.renterType"),
      cell: (row) => (
        <span className="grid justify-items-start gap-0.5">
          {t(`renterType.${row.renterType}`)}
          {row.status === "moving_out" ? (
            <Chip tone="warn" plain>
              {t("movingOut")}
            </Chip>
          ) : null}
        </span>
      ),
    },
    { key: "startDate", header: t("col.startDate"), cell: (row) => <span className="num">{formatDate(row.startDate, locale, "short")}</span> },
    { key: "household", header: t("col.household"), numeric: true, cell: (row) => count(row.household) },
    {
      key: "policeForm",
      header: t("col.policeForm"),
      cell: (row) => <Chip tone={row.policeForm ? "good" : "warn"}>{row.policeForm ? t("policeForm.yes") : t("policeForm.no")}</Chip>,
    },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub")}
        csv={csvHref("renters", { locationId: report.location?.id, lang: locale })}
        actions={<RentersPrint report={report} society={brand.name} place={report.location?.name ?? null} />}
      />
      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-3">
        <StatCard icon={ClipboardList} tone="acc" label={t("stats.tenancies")} value={count(report.totals.tenancies)} />
        <StatCard icon={Users} tone="info" label={t("stats.people")} value={count(report.totals.people)} />
        <StatCard icon={FileWarning} tone="warn" label={t("stats.policeFormMissing")} value={count(report.totals.policeFormMissing)} />
      </div>
      <div className="mb-3.5">
        <Note>{t("noNid")}</Note>
      </div>
      {report.truncated ? (
        <div className="mb-3.5">
          <Note tone="warn">{t("truncated", { count: count(report.rows.length) })}</Note>
        </div>
      ) : null}
      <DataTable columns={columns} rows={report.rows} rowKey={(row) => row.tenancyId} caption={t("title")} empty={t("empty")} />
    </>
  );
}
