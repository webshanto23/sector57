import { canSocietyWide, type Locale } from "@s57/shared";
import { Repeat } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { RunsTable } from "@/components/recurring/runs-table";
import { SchedulesManager } from "@/components/recurring/schedules-manager";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getChargeTypes } from "@/lib/api/finance";
import { getBillingRuns, getSchedules } from "@/lib/api/recurring";
import { requirePermission } from "@/lib/api/session";
import { dhakaDay } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/recurring">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.recurring") };
}

/** Recurring charges (what billing runs bill) and the run history. */
export default async function RecurringPage({ params }: PageProps<"/[locale]/dashboard/recurring">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("billing");
  const [t, tNav, list, chargeTypes, runs] = await Promise.all([
    getTranslations("Recurring"),
    getTranslations("Dashboard.nav"),
    getSchedules(),
    getChargeTypes(),
    getBillingRuns(),
  ]);

  return (
    <>
      <PageHeader
        title={tNav("recurring")}
        sub={t("sub")}
        actions={
          canSocietyWide(me.access, "billing", "create") ? (
            <Link href="/dashboard/recurring/run" className={buttonVariants()}>
              <Repeat aria-hidden />
              {t("runBilling")}
            </Link>
          ) : null
        }
      />
      <div className="grid max-w-[1100px] gap-5">
        <SchedulesManager list={list} chargeTypes={chargeTypes} thisMonth={dhakaDay().slice(0, 7)} />
        {runs ? <RunsTable runs={runs.items} locale={locale} /> : null}
      </div>
    </>
  );
}
