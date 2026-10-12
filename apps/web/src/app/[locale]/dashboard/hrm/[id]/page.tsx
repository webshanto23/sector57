import { formatDate, formatTaka, isoMonth, localDigits, pick, type Locale } from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card, Chip, PageHeader } from "@/components/kit";
import { MonthCalendar } from "@/components/staff/month-calendar";
import { LeaveCard, RejoinCard, StaffEditor } from "@/components/staff/staff-editor";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { todayInDhaka } from "@/lib/dhaka-time";
import { requirePermission } from "@/lib/api/session";
import { getAttendanceMonth, getStaff } from "@/lib/api/staff";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("staff");
  const staff = await getStaff(id);
  return staff ? { title: staff.person.name } : {};
}

/** One stint: the job, the post, the person, leaving or rejoining, the month's attendance and papers. */
export default async function StaffMemberPage({ params, searchParams }: PageProps<"/[locale]/dashboard/hrm/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("staff");
  const today = todayInDhaka();
  const requested = (await searchParams)["month"];
  const month = isoMonth.safeParse(requested).success ? (requested as string) : today.slice(0, 7);
  const [t, staff] = await Promise.all([getTranslations("Staff"), getStaff(id)]);
  if (!staff) notFound();
  const attendance = staff.can.attendance ? await getAttendanceMonth(staff.id, month) : null;
  const current = staff.leftOn === null;

  return (
    <>
      <PageHeader
        title={pick(staff.person.name, staff.person.nameEn, locale)}
        sub={[pick(staff.designation.bn, staff.designation.en, locale), staff.person.phone ? localDigits(staff.person.phone, locale) : null].filter(Boolean).join(" · ")}
        actions={
          <Link href="/dashboard/hrm" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Chip tone="acc" plain>
            {t("staffNo", { no: localDigits(staff.staffNo, locale) })}
          </Chip>
          <Chip>{t(`kind.${staff.kind}`)}</Chip>
          {current ? (
            <Chip tone="good">{t("workingSince", { date: formatDate(staff.joinedOn, locale, "short") })}</Chip>
          ) : (
            <Chip tone="warn">{t("leftOnShort", { date: formatDate(staff.leftOn!, locale, "short") })}</Chip>
          )}
          <span>{t("postedLine", { place: [...staff.posted.address, staff.posted.name].join(", ") })}</span>
          {staff.hasLogin ? <Chip tone="info">{t("hasLogin")}</Chip> : null}
        </div>

        {!current ? <Note>{t("leftNote", { reason: staff.leftReason ?? "" })}</Note> : !staff.can.edit ? <Note>{t("readOnly")}</Note> : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-3.5">
            {staff.can.edit ? <StaffEditor key={staff.id} staff={staff} /> : <Summary staff={staff} locale={locale} t={t} />}
            {attendance ? (
              <MonthCalendar month={month} data={attendance} locale={locale} href={(target) => `/dashboard/hrm/${staff.id}?month=${target}`} />
            ) : null}
          </div>
          <div className="grid content-start gap-3.5">
            {staff.can.leave ? <LeaveCard staff={staff} today={today} /> : null}
            {staff.can.rejoin ? <RejoinCard staff={staff} today={today} /> : null}
            {staff.stints.length > 0 ? (
              <Card className="grid gap-2">
                <h2 className="text-[15px]">{t("stints")}</h2>
                <ul className="grid gap-1.5 text-[13.5px]">
                  {staff.stints.map((stint) => (
                    <li key={stint.id}>
                      <Link href={`/dashboard/hrm/${stint.id}`} className="font-semibold">
                        {t("staffNo", { no: localDigits(stint.staffNo, locale) })}
                      </Link>{" "}
                      · {pick(stint.designation.bn, stint.designation.en, locale)} ·{" "}
                      <span className="num">
                        {formatDate(stint.joinedOn, locale, "short")} – {stint.leftOn ? formatDate(stint.leftOn, locale, "short") : t("now")}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {staff.can.viewPerson ? (
              <Link href={`/dashboard/members/${staff.person.id}`} className={`${buttonVariants({ variant: "outline" })} justify-self-start`}>
                <ExternalLink aria-hidden />
                {t("openPerson")}
              </Link>
            ) : null}
            <DocumentsPanel access={me.access} entityType="staff" entityId={staff.id} />
          </div>
        </div>
      </div>
    </>
  );
}

/** The stint as text, for those who may only look (or once they have left). */
function Summary({ staff, locale, t }: { staff: NonNullable<Awaited<ReturnType<typeof getStaff>>>; locale: Locale; t: Awaited<ReturnType<typeof getTranslations<"Staff">>> }) {
  const rows: [string, string][] = [
    [t("designationBn"), pick(staff.designation.bn, staff.designation.en, locale)],
    [t("kindLabel"), t(`kind.${staff.kind}`)],
    [t("joinedOn"), formatDate(staff.joinedOn, locale)],
    ...(staff.leftOn ? ([[t("leftOn"), formatDate(staff.leftOn, locale)]] as [string, string][]) : []),
    ...(staff.pay ? ([[staff.kind === "daily" ? t("dailyRate") : t("monthlySalary"), formatTaka(staff.pay, locale)]] as [string, string][]) : []),
    [t("phone"), staff.personDetail.phone ? localDigits(staff.personDetail.phone, locale) : "—"],
    [t("nid"), staff.personDetail.nid ? localDigits(staff.personDetail.nid, locale) : staff.personDetail.hasNid ? t("nidHidden") : "—"],
  ];
  return (
    <Card className="grid gap-2">
      <h2 className="text-[15px]">{t("job")}</h2>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
