import { addDays, canAnywhere, formatDate, formatNumber, isoDay, type Locale } from "@s57/shared";
import { CalendarCheck, CircleDashed, Download, UserCheck, UserX } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { inputClass, PageHeader, StatCard } from "@/components/kit";
import { AttendanceRoster } from "@/components/staff/attendance-roster";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { todayInDhaka } from "@/lib/dhaka-time";
import { requirePermission } from "@/lib/api/session";
import { csvHref, getAttendanceDay } from "@/lib/api/staff";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm/attendance">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Attendance" });
  return { title: t("title") };
}

/** The day's roster in the user's area: today unless another (past) day is picked. */
export default async function AttendancePage({ params, searchParams }: PageProps<"/[locale]/dashboard/hrm/attendance">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("attendance");
  const today = todayInDhaka();
  const requested = (await searchParams)["date"];
  const date = isoDay.safeParse(requested).success && (requested as string) <= today ? (requested as string) : today;
  const [t, day] = await Promise.all([getTranslations("Attendance"), getAttendanceDay({ date })]);
  if (!day) notFound();
  const n = (value: number) => formatNumber(value, locale);
  const dayLink = (target: string) => `/dashboard/hrm/attendance?date=${target}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={formatDate(date, locale)}
        actions={
          canAnywhere(me.access, "attendance", "export") ? (
            <a href={csvHref("/attendance/csv", { month: date.slice(0, 7), lang: locale })} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden />
              {t("csv")}
            </a>
          ) : null
        }
      />

      <form method="get" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <label htmlFor="attendance-date" className="text-[13.5px] font-semibold">
          {t("date")}
        </label>
        <input id="attendance-date" name="date" type="date" max={today} defaultValue={date} className={`${inputClass} sm:w-auto!`} />
        <Button type="submit" variant="outline">
          {t("show")}
        </Button>
        <Link href={dayLink(addDays(date, -1))} className={buttonVariants({ variant: "ghost" })}>
          {t("dayBefore")}
        </Link>
        {date < today ? (
          <Link href={dayLink(today)} className={buttonVariants({ variant: "ghost" })}>
            {t("today")}
          </Link>
        ) : null}
      </form>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={UserCheck} label={t("status.present")} value={n(day.counts.present + day.counts.half_day)} tone="acc" />
        <StatCard icon={UserX} label={t("status.absent")} value={n(day.counts.absent)} tone="sun" />
        <StatCard icon={CalendarCheck} label={t("leaveOrOff")} value={n(day.counts.leave + day.counts.off)} tone="info" />
        <StatCard icon={CircleDashed} label={t("unmarked")} value={n(day.counts.unmarked)} tone="warn" />
      </div>

      <AttendanceRoster day={day} />
    </>
  );
}
