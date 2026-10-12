import { canAnywhere, formatDate, formatTaka, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, PageHeader } from "@/components/kit";
import { PartyLink, PlaceLink, TenancyStatusChip } from "@/components/members/labels";
import { MoveActions, MoveChecklist } from "@/components/moves/move-actions";
import { MoveStatusChip } from "@/components/moves/move-status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMove } from "@/lib/api/moves";
import { requirePermission } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/moves/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("tenancies");
  const [move, t] = await Promise.all([getMove(id), getTranslations({ locale: locale as Locale, namespace: "Moves" })]);
  return move ? { title: t(`title.${move.kind}`, { unit: move.place.name }) } : {};
}

/** One move-in or move-out: the tenancy, its checklist, the unit's dues, and completing or cancelling it. */
export default async function MovePage({ params }: PageProps<"/[locale]/dashboard/moves/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("tenancies");
  const [move, t, tMembers] = await Promise.all([getMove(id), getTranslations("Moves"), getTranslations("Members")]);
  if (!move) notFound();
  const when = (at: string) => formatDate(at, locale, "short");
  const { tenancy } = move;
  const trail = [
    move.createdBy ? t("startedBy", { name: move.createdBy.name, date: when(move.createdAt) }) : null,
    move.completedBy && move.completedAt ? t("completedBy", { name: move.completedBy.name, date: when(move.completedAt) }) : null,
    move.cancelledBy && move.cancelledAt ? t("cancelledBy", { name: move.cancelledBy.name, date: when(move.cancelledAt) }) : null,
  ].filter((line): line is string => line !== null);

  return (
    <>
      <PageHeader
        title={t(`title.${move.kind}`, { unit: move.place.name })}
        sub={move.place.address.join(", ") || undefined}
        actions={
          <Link href="/dashboard/moves" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />

      <div className="grid gap-3.5 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="grid content-start gap-3.5">
          <Card className="grid gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <MoveStatusChip status={move.status} />
              <span className="text-[13.5px] text-muted-foreground">{t(`kind.${move.kind}`)}</span>
              {move.plannedDate ? (
                <span className="text-[13.5px] text-muted-foreground">
                  · {t("plannedDate")}: {formatDate(move.plannedDate, locale)}
                </span>
              ) : null}
            </div>
            <dl className="grid gap-2 text-[14px] min-[600px]:grid-cols-[140px_1fr]">
              <dt className="text-muted-foreground">{tMembers("people.tenancy")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {move.renter ? <PartyLink party={move.renter} /> : "—"}
                <span className="text-[12.5px] text-muted-foreground">{tMembers(`renterRole.${move.renterType}`)}</span>
                <TenancyStatusChip status={tenancy.status} />
              </dd>
              <dt className="text-muted-foreground">{t("col.unit")}</dt>
              <dd>
                <PlaceLink place={move.place} open={canAnywhere(me.access, "units")} />
              </dd>
              <dt className="text-muted-foreground">{t("tenancy")}</dt>
              <dd className="num">
                {tenancy.endDate
                  ? t("tenancyDatesEnded", { start: formatDate(tenancy.startDate, locale), end: formatDate(tenancy.endDate, locale) })
                  : t("tenancyDates", { start: formatDate(tenancy.startDate, locale) })}
              </dd>
            </dl>
            {trail.length ? (
              <ul className="grid gap-0.5 border-t border-line pt-2 text-[12.5px] text-muted-foreground">
                {trail.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </Card>

          <MoveChecklist move={move} />
        </div>

        <div className="grid content-start gap-3.5">
          {move.kind === "move_out" ? (
            <Card className="grid gap-2">
              <h2 className="text-[15px]">{t("dues")}</h2>
              {move.dues === null ? (
                <p className="text-[13.5px] text-muted-foreground">{t("duesHidden")}</p>
              ) : move.dues.owed === "0.00" ? (
                <p className="text-[13.5px] text-good">{t("duesNone")}</p>
              ) : (
                <p className="text-[13.5px] font-semibold text-bad">
                  {t("duesOwed", { owed: formatTaka(move.dues.owed, locale), count: move.dues.bills })}
                </p>
              )}
              {move.status === "done" && !move.duesCleared ? <Note tone="warn">{t("duesNotCleared")}</Note> : null}
              {move.dues && move.dues.bills > 0 ? (
                <Link
                  href={{ pathname: "/dashboard/billing", query: { unitId: move.place.id } }}
                  className="text-[12.5px] font-medium text-primary"
                >
                  {t("billsLink")}
                </Link>
              ) : null}
            </Card>
          ) : null}
          <MoveActions move={move} today={todayInDhaka()} />
        </div>
      </div>
    </>
  );
}
