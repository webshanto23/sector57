import { formatNumber, formatTaka, pick, WORK_ORDER_SOURCES, WORK_ORDER_VIEWS, workOrderListQuery, type Locale, type WorkOrderRow } from "@s57/shared";
import { ClipboardList, Hammer, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { WorkOrderStatusChip } from "@/components/helpdesk/ticket-chips";
import { DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getWorkOrders } from "@/lib/api/helpdesk";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/work">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.work") };
}

/** Work orders in the user's area: open and in progress by default (oldest first), by source and number. */
export default async function WorkOrdersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/work">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = workOrderListQuery.safeParse({
    q: text("q"),
    view: text("view"),
    source: text("source"),
    locationId: text("locationId"),
    staffId: text("staffId"),
    vendorId: text("vendorId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : workOrderListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tDashboard, list] = await Promise.all([getTranslations("WorkOrders"), getTranslations("Dashboard"), getWorkOrders(query)]);
  const n = (value: number) => formatNumber(value, locale);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.view !== "active" ? { view: query.view } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.staffId ? { staffId: query.staffId } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
  };

  const columns: Column<WorkOrderRow>[] = [
    {
      key: "order",
      header: t("col.order"),
      cell: (row) => (
        <Link href={`/dashboard/work/${row.id}`} className="grid font-semibold text-fg">
          {row.title}
          <span className="num text-[12.5px] font-normal text-muted-foreground">
            {row.woNo} · {t(`sourceKind.${row.source}`)}
          </span>
        </Link>
      ),
    },
    {
      key: "place",
      header: t("col.place"),
      cell: (row) => (
        <span className="grid">
          {row.asset ? <span>{pick(row.asset.name.bn, row.asset.name.en, locale)}</span> : row.ticket ? <span className="num">{row.ticket.ticketNo}</span> : null}
          <span className={row.asset || row.ticket ? "text-[12.5px] text-muted-foreground" : undefined}>{[...row.place.address, row.place.name].join(", ")}</span>
        </span>
      ),
    },
    {
      key: "assignee",
      header: t("col.assignee"),
      cell: (row) => (row.staff ? pick(row.staff.name, row.staff.nameEn, locale) : (row.vendor?.name ?? "—")),
    },
    { key: "status", header: t("col.status"), cell: (row) => <WorkOrderStatusChip status={row.status} /> },
    { key: "cost", header: t("col.estimate"), numeric: true, cell: (row) => (row.estimatedCost ? formatTaka(row.estimatedCost, locale) : "—") },
  ];

  return (
    <>
      <PageHeader
        title={tDashboard("nav.work")}
        sub={t("sub")}
        actions={
          list.can.create ? (
            <Link href="/dashboard/work/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("add")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={ClipboardList} label={t("stats.open")} value={n(list.counts.open)} tone="acc" />
        <StatCard icon={Hammer} label={t("stats.inProgress")} value={n(list.counts.inProgress)} tone="warn" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.locationId ? <input type="hidden" name="locationId" value={query.locationId} /> : null}
        {query.staffId ? <input type="hidden" name="staffId" value={query.staffId} /> : null}
        {query.vendorId ? <input type="hidden" name="vendorId" value={query.vendorId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="view" defaultValue={query.view} aria-label={t("viewLabel")} className={`${inputClass} w-auto`}>
          {WORK_ORDER_VIEWS.map((key) => (
            <option key={key} value={key}>
              {t(`view.${key}`)}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={query.source ?? ""} aria-label={t("source")} className={`${inputClass} w-auto`}>
          <option value="">{t("allSources")}</option>
          {WORK_ORDER_SOURCES.map((key) => (
            <option key={key} value={key}>
              {t(`sourceKind.${key}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tDashboard("nav.work")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/work", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
