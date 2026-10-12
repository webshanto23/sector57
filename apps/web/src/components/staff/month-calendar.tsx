import { ATTENDANCE_STATUSES, formatNumber, localDigits, type AttendanceMonth, type Locale } from "@s57/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, Chip } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ATTENDANCE_CELL, ATTENDANCE_TONE } from "./attendance-tone";

/** `YYYY-MM` moved by `n` months. */
export function shiftMonth(month: string, n: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mon - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Weeks start on Saturday, as office calendars in Bangladesh do.
const SATURDAY_FIRST = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 1) % 7;

/** One staff member's month: a cell per day coloured by status, with counts and days worked. */
export async function MonthCalendar({ month, data, href, locale }: { month: string; data: AttendanceMonth; href: (month: string) => string; locale: Locale }) {
  const t = await getTranslations("Attendance");
  const intl = locale === "bn" ? "bn-BD" : "en-GB";
  const title = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const weekday = new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" });
  // 2026-10-03 is a Saturday: seven days from it give the column heads.
  const heads = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2026, 9, 3 + i))));
  const lead = SATURDAY_FIRST(data.days[0]!.date);

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("monthTitle", { month: title })}</h2>
        <div className="flex gap-1.5">
          <Link href={href(shiftMonth(month, -1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={t("prevMonth")}>
            <ChevronLeft aria-hidden />
          </Link>
          <Link href={href(shiftMonth(month, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={t("nextMonth")}>
            <ChevronRight aria-hidden />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {heads.map((head) => (
          <div key={head} aria-hidden className="py-1 text-[11.5px] font-semibold text-muted-foreground">
            {head}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden />
        ))}
        {data.days.map((day) => {
          const label = day.outside ? t("outside") : day.mark ? t(`status.${day.mark.status}`) : t("unmarked");
          return (
            <div
              key={day.date}
              title={[label, day.mark?.inTime && `${day.mark.inTime}–${day.mark.outTime ?? ""}`, day.mark?.note].filter(Boolean).join(" · ")}
              className={`num grid min-h-11 place-items-center rounded-[6px] text-[13px] ${
                day.outside ? "text-muted-foreground/50" : day.mark ? ATTENDANCE_CELL[day.mark.status] : "border border-dashed border-line"
              }`}
            >
              {localDigits(Number(day.date.slice(8)), locale)}
              <span className="sr-only">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ATTENDANCE_STATUSES.map((status) => (
          <Chip key={status} tone={ATTENDANCE_TONE[status]}>
            {t(`status.${status}`)}: <span className="num">{formatNumber(data.counts[status], locale)}</span>
          </Chip>
        ))}
        <Chip>
          {t("unmarked")}: <span className="num">{formatNumber(data.counts.unmarked, locale)}</span>
        </Chip>
      </div>
      <p className="text-[13.5px]">
        <b>{t("daysWorked")}:</b> <span className="num">{formatNumber(data.daysWorked, locale)}</span>
      </p>
    </Card>
  );
}
