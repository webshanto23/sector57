import { canAnywhere, formatDate, formatNumber, membersReportQuery, pick, type Locale, type MembersReport } from "@s57/shared";
import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DataTable, Field, inputClass, StatCard, type Column } from "@/components/kit";
import { canExportReport } from "@/components/reports/access";
import { ReportHeader } from "@/components/reports/report-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { csvHref, getMembersReport } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/members">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.members" });
  return { title: t("title") };
}

type Joined = MembersReport["joined"][number];

/** Society members by status, and who joined in a date range, in the user's area. */
export default async function MembersReportPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/members">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canAnywhere(me.access, "members")) notFound();
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = membersReportQuery.safeParse({ from: text("from"), to: text("to"), locationId: text("locationId") });
  const [t, tReports, tErrors, found] = await Promise.all([
    getTranslations("Reports.members"),
    getTranslations("Reports"),
    getTranslations("Admin.errors"),
    getMembersReport(parsed.success ? parsed.data : {}),
  ]);
  const report = found ?? (await getMembersReport({}));
  if (!report) notFound();
  const count = (value: number) => formatNumber(value, locale);
  const personLinks = canAnywhere(me.access, "members");

  const columns: Column<Joined>[] = [
    { key: "memberNo", header: t("col.memberNo"), numeric: true, cell: (row) => count(row.memberNo) },
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <span className="grid">
          {personLinks ? (
            <Link href={`/dashboard/members/${row.personId}`} className="font-semibold text-fg">
              {pick(row.name, row.nameEn, locale)}
            </Link>
          ) : (
            <b>{pick(row.name, row.nameEn, locale)}</b>
          )}
          {row.phone ? <span className="num text-[12.5px] text-muted-foreground">{row.phone}</span> : null}
        </span>
      ),
    },
    { key: "address", header: t("col.address"), cell: (row) => row.address.join(", ") || "—" },
    { key: "joinedOn", header: t("col.joinedOn"), cell: (row) => <span className="num">{formatDate(row.joinedOn, locale, "short")}</span> },
    { key: "status", header: t("col.status"), cell: (row) => t(`status.${row.status}`) },
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub")}
        csv={canExportReport(me.access, "members") ? csvHref("members", { from: report.from, to: report.to, locationId: report.location?.id, lang: locale }) : null}
      />

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-3">
        <StatCard icon={CircleCheck} tone="acc" label={t("status.active")} value={count(report.counts.active)} />
        <StatCard icon={Hourglass} tone="warn" label={t("status.lapsed")} value={count(report.counts.lapsed)} />
        <StatCard icon={CircleX} tone="sun" label={t("status.cancelled")} value={count(report.counts.cancelled)} />
      </div>

      <h2 className="mb-2 text-[15px]">{t("joinedTitle")}</h2>
      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {report.location ? <input type="hidden" name="locationId" value={report.location.id} /> : null}
        <Field label={tReports("from")} htmlFor="members-from">
          <input id="members-from" type="date" name="from" defaultValue={report.from} className={`${inputClass} w-auto`} />
        </Field>
        <Field label={tReports("to")} htmlFor="members-to">
          <input id="members-to" type="date" name="to" defaultValue={report.to} className={`${inputClass} w-auto`} />
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
      {report.truncated ? (
        <div className="mb-3.5">
          <Note tone="warn">{t("truncated", { count: count(report.joined.length) })}</Note>
        </div>
      ) : null}
      <DataTable columns={columns} rows={report.joined} rowKey={(row) => `${row.memberNo}`} caption={t("joinedTitle")} empty={t("empty")} />
    </>
  );
}
