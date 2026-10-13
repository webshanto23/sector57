import { formatDate, formatTaka, isWorkOrderFinished, pick, type Locale, type WorkOrderDetail } from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { WorkOrderStatusChip } from "@/components/helpdesk/ticket-chips";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { WorkOrderActions } from "@/components/work-orders/work-order-actions";
import { WorkOrderEditor } from "@/components/work-orders/work-order-forms";
import { Link } from "@/i18n/navigation";
import { getExpenseOptions } from "@/lib/api/expenses";
import { getWorkOrder, getWorkOrderOptions } from "@/lib/api/helpdesk";
import { todayInDhaka } from "@/lib/dhaka-time";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/work/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("work_orders");
  const order = await getWorkOrder(id);
  return order ? { title: `${order.woNo} ${order.title}` } : {};
}

/** One work order: what and where, where it came from, who does it, and starting, finishing or cancelling it. */
export default async function WorkOrderPage({ params }: PageProps<"/[locale]/dashboard/work/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, order] = await Promise.all([getTranslations("WorkOrders"), getWorkOrder(id)]);
  if (!order) notFound();
  const [options, expenseOptions] = await Promise.all([
    order.can.edit ? getWorkOrderOptions() : null,
    order.can.cost && order.can.statuses.includes("done") ? getExpenseOptions() : null,
  ]);
  const heads = (expenseOptions?.heads ?? []).filter((head) => !head.archived);
  const placeLine = [...order.place.address, order.place.name].join(", ");

  return (
    <>
      <PageHeader
        title={order.title}
        sub={[order.woNo, placeLine].join(" · ")}
        actions={
          <Link href="/dashboard/work" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <WorkOrderStatusChip status={order.status} />
          <span>{t(`sourceKind.${order.source}`)}</span>
        </div>

        {order.status === "cancelled" ? (
          <Note>{t("cancelledNote", { date: order.cancelledAt ? formatDate(order.cancelledAt, locale, "short") : "", reason: order.cancelReason ?? "" })}</Note>
        ) : !isWorkOrderFinished(order.status) && !order.can.edit && order.can.statuses.length === 0 ? (
          <Note>{t("readOnly")}</Note>
        ) : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-3.5">
            <Summary order={order} locale={locale} t={t} />
            {order.can.edit && options ? <WorkOrderEditor key={order.id} order={order} options={options} /> : null}
          </div>
          <div className="grid content-start gap-3.5">
            {order.can.statuses.length > 0 ? <WorkOrderActions key={order.status} order={order} today={todayInDhaka()} heads={heads} /> : null}
            <Links order={order} t={t} />
          </div>
        </div>
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"WorkOrders">>>;

function Summary({ order, locale, t }: { order: WorkOrderDetail; locale: Locale; t: T }) {
  const rows: [string, string][] = [
    [t("description"), order.description ?? "—"],
    [t("assignee"), order.staff ? pick(order.staff.name, order.staff.nameEn, locale) : (order.vendor?.name ?? t("assigneeKind.none"))],
    [t("estimatedCost"), order.estimatedCost ? formatTaka(order.estimatedCost, locale) : "—"],
    [t("raised"), [formatDate(order.createdAt, locale, "short"), order.createdBy?.name].filter(Boolean).join(" · ")],
  ];
  if (order.plan) rows.push([t("plan"), pick(order.plan.task.bn, order.plan.task.en, locale)]);
  if (order.completedOn) rows.push([t("completedOn"), `${formatDate(order.completedOn, locale, "short")}: ${order.completionNote ?? ""}`]);
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

/** Where it came from and the expense it raised, each a link when the user may open it. */
function Links({ order, t }: { order: WorkOrderDetail; t: T }) {
  const links: { key: string; href: string; label: string }[] = [];
  if (order.ticket?.open) links.push({ key: "ticket", href: `/dashboard/helpdesk/${order.ticket.id}`, label: t("openTicket", { no: order.ticket.ticketNo }) });
  if (order.asset?.open) links.push({ key: "asset", href: `/dashboard/facilities/assets/${order.asset.id}`, label: t("openAsset", { no: order.asset.assetNo }) });
  if (order.expense?.open) links.push({ key: "expense", href: `/dashboard/expenses/${order.expense.id}`, label: t("openExpense") });
  if (links.length === 0 && !order.expense) return null;
  return (
    <Card className="grid gap-2.5">
      <h2 className="text-[15px]">{t("links")}</h2>
      {order.expense ? <p className="text-[13px] text-muted-foreground">{t("expenseNote", { status: t(`expenseStatus.${order.expense.status}`) })}</p> : null}
      {links.map((link) => (
        <Link key={link.key} href={link.href} className={`${buttonVariants({ variant: "outline" })} justify-self-start`}>
          <ExternalLink aria-hidden />
          {link.label}
        </Link>
      ))}
    </Card>
  );
}
