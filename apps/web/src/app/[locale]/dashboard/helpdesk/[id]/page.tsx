import { formatDate, isTicketFinished, pick, type Locale, type TicketDetail } from "@s57/shared";
import { ChevronLeft, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DueChip, PriorityChip, TicketStatusChip, WorkOrderStatusChip } from "@/components/helpdesk/ticket-chips";
import { AssignCard, TicketEditor, TicketStatusCard } from "@/components/helpdesk/ticket-forms";
import { TicketNoteCard } from "@/components/helpdesk/ticket-note";
import { TicketTimeline } from "@/components/helpdesk/ticket-timeline";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getTicket } from "@/lib/api/helpdesk";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/helpdesk/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("helpdesk");
  const ticket = await getTicket(id);
  return ticket ? { title: `${ticket.ticketNo} ${ticket.title}` } : {};
}

/** One ticket: what and where, its timeline, who has it, its status, notes and photos, and its work orders. */
export default async function TicketPage({ params }: PageProps<"/[locale]/dashboard/helpdesk/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, ticket] = await Promise.all([getTranslations("Helpdesk"), getTicket(id)]);
  if (!ticket) notFound();
  const placeLine = [...ticket.place.address, ticket.place.name].join(", ");

  return (
    <>
      <PageHeader
        title={ticket.title}
        sub={[ticket.ticketNo, t(`category.${ticket.category}`), placeLine].join(" · ")}
        actions={
          <Link href="/dashboard/helpdesk" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <TicketStatusChip status={ticket.status} />
          <PriorityChip priority={ticket.priority} />
          <DueChip status={ticket.status} dueAt={ticket.dueAt} overdue={ticket.overdue} />
          {ticket.assignee ? <span>{t("assignedTo", { name: pick(ticket.assignee.name, ticket.assignee.nameEn, locale) })}</span> : null}
        </div>

        {isTicketFinished(ticket.status) ? (
          <Note>{t(ticket.status === "closed" ? "closedNote" : "cancelledNote", { date: ticket.closedAt ? formatDate(ticket.closedAt, locale, "dateTime") : "" })}</Note>
        ) : !ticket.can.edit && ticket.can.statuses.length === 0 ? (
          <Note>{t("readOnly")}</Note>
        ) : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-3.5">
            <Summary ticket={ticket} locale={locale} t={t} />
            {ticket.can.edit ? <TicketEditor key={ticket.id} ticket={ticket} /> : null}
            <TicketTimeline events={ticket.events} locale={locale} />
          </div>
          <div className="grid content-start gap-3.5">
            {ticket.can.statuses.length > 0 ? <TicketStatusCard key={ticket.status} ticket={ticket} /> : null}
            {ticket.can.edit ? <AssignCard key={ticket.assignee?.id ?? "nobody"} ticket={ticket} /> : null}
            {ticket.can.edit ? <TicketNoteCard ticket={ticket} /> : null}
            <WorkOrdersCard ticket={ticket} t={t} />
          </div>
        </div>
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"Helpdesk">>>;

function Summary({ ticket, locale, t }: { ticket: TicketDetail; locale: Locale; t: T }) {
  const reporter =
    ticket.reporter.kind === "none" ? t("reporterNone") : ticket.reporter.kind === "typed" ? [ticket.reporter.name, ticket.reporter.phone].filter(Boolean).join(", ") : ticket.reporter.name;
  const rows: [string, string][] = [
    [t("description"), ticket.description ?? "—"],
    [t("reporter"), reporter],
    [t("openedAt"), [formatDate(ticket.createdAt, locale, "dateTime"), ticket.reportedBy?.name].filter(Boolean).join(" · ")],
    [t("dueAt"), formatDate(ticket.dueAt, locale, "dateTime")],
  ];
  if (ticket.resolvedAt) rows.push([t("resolvedAt"), `${formatDate(ticket.resolvedAt, locale, "dateTime")}: ${ticket.resolutionNote ?? ""}`]);
  return (
    <Card className="grid gap-2">
      <h2 className="text-[15px]">{t("summary")}</h2>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Work orders raised on the ticket, and "Create work order" for those who may. */
function WorkOrdersCard({ ticket, t }: { ticket: TicketDetail; t: T }) {
  if (ticket.workOrders.length === 0 && !ticket.can.workOrder) return null;
  return (
    <Card className="grid gap-2.5">
      <h2 className="text-[15px]">{t("workOrders")}</h2>
      {ticket.workOrders.length === 0 ? <p className="text-[13px] text-muted-foreground">{t("workOrdersNone")}</p> : null}
      {ticket.workOrders.map((order) => (
        <Link key={order.id} href={`/dashboard/work/${order.id}`} className="flex items-center justify-between gap-2 border-t border-line pt-2 text-[13.5px]">
          <span className="min-w-0 truncate">
            <span className="num text-muted-foreground">{order.woNo}</span> {order.title}
          </span>
          <WorkOrderStatusChip status={order.status} />
        </Link>
      ))}
      {ticket.can.workOrder ? <p className="text-[12.5px] text-muted-foreground">{t("workOrderHint")}</p> : null}
      {ticket.can.workOrder ? (
        <Link href={{ pathname: "/dashboard/work/new", query: { ticketId: ticket.id } }} className={`${buttonVariants({ variant: "outline" })} justify-self-start`}>
          <ClipboardList aria-hidden />
          {t("createWorkOrder")}
        </Link>
      ) : null}
    </Card>
  );
}
