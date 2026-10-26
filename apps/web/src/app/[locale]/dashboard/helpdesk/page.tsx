import { canAnywhere, formatNumber, pick, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_VIEWS, ticketListQuery, type Locale, type TicketRow } from "@s57/shared";
import { CircleCheck, Clock, Hourglass, LifeBuoy, Plus, Timer } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { DueChip, PriorityChip, TicketStatusChip } from "@/components/helpdesk/ticket-chips";
import { DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getTickets } from "@/lib/api/helpdesk";
import { getMe } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/helpdesk">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.helpdesk") };
}

/** Tickets in the user's area: still waiting by default (soonest due first), with the stat cards and filters. */
export default async function HelpdeskPage({ params, searchParams }: PageProps<"/[locale]/dashboard/helpdesk">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = ticketListQuery.safeParse({
    q: text("q"),
    view: text("view"),
    category: text("categoryLabel"),
    priority: text("priority"),
    locationId: text("locationId"),
    staffId: text("staffId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : ticketListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tDashboard, list, me] = await Promise.all([getTranslations("Helpdesk"), getTranslations("Dashboard"), getTickets(query), getMe()]);
  const n = (value: number) => formatNumber(value, locale);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.view !== "active" ? { view: query.view } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.staffId ? { staffId: query.staffId } : {}),
  };
  const view = (target: string) => ({ pathname: "/dashboard/helpdesk", query: target === "active" ? {} : { view: target } });

  const columns: Column<TicketRow>[] = [
    {
      key: "ticket",
      header: t("col.ticket"),
      cell: (row) => (
        <Link href={`/dashboard/helpdesk/${row.id}`} className="grid font-semibold text-fg">
          {row.title}
          <span className="num text-[12.5px] font-normal text-muted-foreground">
            {row.ticketNo} · {t(`category.${row.category}`)}
          </span>
        </Link>
      ),
    },
    { key: "place", header: t("col.place"), cell: (row) => [...row.place.address, row.place.name].join(", ") },
    {
      key: "status",
      header: t("col.status"),
      cell: (row) => (
        <span className="flex flex-wrap gap-1.5">
          <TicketStatusChip status={row.status} />
          {row.priority === "high" || row.priority === "urgent" ? <PriorityChip priority={row.priority} /> : null}
        </span>
      ),
    },
    { key: "assignee", header: t("col.assignee"), cell: (row) => (row.assignee ? pick(row.assignee.name, row.assignee.nameEn, locale) : "—") },
    { key: "due", header: t("col.due"), cell: (row) => <DueChip status={row.status} dueAt={row.dueAt} overdue={row.overdue} /> },
  ];

  return (
    <>
      <PageHeader
        title={tDashboard("nav.helpdesk")}
        sub={t("sub")}
        actions={
          <>
            {me && canAnywhere(me.access, "settings", "edit") ? (
              <Link href="/dashboard/helpdesk/hours" className={buttonVariants({ variant: "outline" })}>
                <Timer aria-hidden />
                {t("hoursLink")}
              </Link>
            ) : null}
            {list.can.create ? (
              <Link href="/dashboard/helpdesk/new" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("add")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <Link href={view("active")} className="contents">
          <StatCard icon={LifeBuoy} label={t("stats.active")} value={n(list.counts.active)} tone="acc" />
        </Link>
        <Link href={view("overdue")} className="contents">
          <StatCard icon={Clock} label={t("stats.overdue")} value={n(list.counts.overdue)} tone="warn" />
        </Link>
        <StatCard icon={Hourglass} label={t("stats.dueToday")} value={n(list.counts.dueToday)} tone="sun" />
        <Link href={view("resolved")} className="contents">
          <StatCard icon={CircleCheck} label={t("stats.resolvedWeek")} value={n(list.counts.resolvedWeek)} tone="info" />
        </Link>
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.locationId ? <input type="hidden" name="locationId" value={query.locationId} /> : null}
        {query.staffId ? <input type="hidden" name="staffId" value={query.staffId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="view" defaultValue={query.view} aria-label={t("viewLabel")} className={`${inputClass} sm:w-auto!`}>
          {TICKET_VIEWS.map((key) => (
            <option key={key} value={key}>
              {t(`view.${key}`)}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={query.category ?? ""} aria-label={t("categoryLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allCategories")}</option>
          {TICKET_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`category.${key}`)}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={query.priority ?? ""} aria-label={t("priorityLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allPriorities")}</option>
          {TICKET_PRIORITIES.map((key) => (
            <option key={key} value={key}>
              {t(`priority.${key}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tDashboard("nav.helpdesk")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/helpdesk", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
