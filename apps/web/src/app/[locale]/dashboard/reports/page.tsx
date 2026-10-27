import { REPORT_KEYS, type Locale, type ReportKey } from "@s57/shared";
import { BookOpen, Building2, ChartColumn, ClipboardList, Clock, IdCard, ReceiptText, Scale, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, IconBox, PageHeader } from "@/components/kit";
import { canSeeReport } from "@/components/reports/access";
import { Link } from "@/i18n/navigation";
import { getMe } from "@/lib/api/session";

const ICONS: Record<ReportKey, LucideIcon> = {
  "day-book": BookOpen,
  collection: ChartColumn,
  "collection-register": ReceiptText,
  arrears: Clock,
  income: Scale,
  occupancy: Building2,
  members: IdCard,
  renters: ClipboardList,
};

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.reports") };
}

/** The finance and records reports this user may open. */
export default async function ReportsPage({ params }: PageProps<"/[locale]/dashboard/reports">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await getMe();
  const reports = me ? REPORT_KEYS.filter((report) => canSeeReport(me.access, report)) : [];
  if (reports.length === 0) notFound();
  const [t, tNav] = await Promise.all([getTranslations("Reports"), getTranslations("Dashboard.nav")]);

  return (
    <>
      <PageHeader title={tNav("reports")} sub={t("sub")} />
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        {reports.map((report) => (
          <Link key={report} href={`/dashboard/reports/${report}`} className="block">
            <Card className="flex h-full items-start gap-3 hover:border-primary">
              <IconBox icon={ICONS[report]} />
              <span className="grid gap-1">
                <b className="text-[15px]">{t(`cards.${report}.title`)}</b>
                <span className="text-[13.5px] text-muted-foreground">{t(`cards.${report}.body`)}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
