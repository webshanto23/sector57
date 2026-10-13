import { canAnywhere, isAssetGone, isTicketFinished, pick, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { NewWorkOrderForm, type WorkOrderSource } from "@/components/work-orders/work-order-forms";
import { Link } from "@/i18n/navigation";
import { getAsset } from "@/lib/api/facilities";
import { getTicket, getWorkOrderOptions } from "@/lib/api/helpdesk";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/work/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "WorkOrders" });
  return { title: t("newTitle") };
}

/**
 * A new work order: on a ticket (`?ticketId=`), on an asset or one of its upkeep plans
 * (`?assetId=`, `&planId=`), or on a place picked here. The API checks the user may see the
 * source and raise work there.
 */
export default async function NewWorkOrderPage({ params, searchParams }: PageProps<"/[locale]/dashboard/work/new">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("work_orders", "create");
  const search = await searchParams;
  const param = (key: string) => (typeof search[key] === "string" && search[key] ? search[key] : null);
  const [t, options] = await Promise.all([getTranslations("WorkOrders"), getWorkOrderOptions()]);

  let source: WorkOrderSource = { kind: "none" };
  const ticketId = param("ticketId");
  const assetId = param("assetId");
  if (ticketId && canAnywhere(me.access, "helpdesk")) {
    const ticket = await getTicket(ticketId);
    if (!ticket || isTicketFinished(ticket.status)) notFound();
    source = { kind: "ticket", id: ticket.id, label: t("fromTicket", { no: ticket.ticketNo, title: ticket.title }), title: ticket.title };
  } else if (assetId && canAnywhere(me.access, "facilities")) {
    const asset = await getAsset(assetId);
    if (!asset || isAssetGone(asset.status)) notFound();
    const planId = param("planId");
    source = {
      kind: "asset",
      id: asset.id,
      label: t("fromAsset", { no: asset.assetNo, name: pick(asset.name.bn, asset.name.en, locale) }),
      plans: asset.plans.map((plan) => ({ id: plan.id, task: plan.task })),
      planId: asset.plans.some((plan) => plan.id === planId) ? planId : null,
    };
  }
  const back = source.kind === "ticket" ? `/dashboard/helpdesk/${source.id}` : source.kind === "asset" ? `/dashboard/facilities/assets/${source.id}` : "/dashboard/work";

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href={back} className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewWorkOrderForm source={source} options={options} />
    </>
  );
}
