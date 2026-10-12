import { formatDate, formatNumber, MOVE_KINDS, MOVE_STATUSES, moveListQuery, type Locale, type MoveRow } from "@s57/shared";
import { LogIn, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Card, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { PartyLink } from "@/components/members/labels";
import { MoveStatusChip } from "@/components/moves/move-status-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMoves } from "@/lib/api/moves";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/moves">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.moves") };
}

/** Move-ins and move-outs in the user's area: open ones first, with their checklist progress. */
export default async function MovesPage({ params, searchParams }: PageProps<"/[locale]/dashboard/moves">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("tenancies");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = moveListQuery.safeParse({
    q: text("q"),
    kind: text("kind"),
    status: text("status"),
    areaId: text("areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, tNav, list] = await Promise.all([getTranslations("Moves"), getTranslations("Dashboard.nav"), getMoves(query)]);
  if (!list) notFound();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);

  const columns: Column<MoveRow>[] = [
    {
      key: "unit",
      header: t("col.unit"),
      cell: (row) => (
        <Link href={`/dashboard/moves/${row.id}`} className="grid font-semibold text-fg">
          {row.place.name}
          {row.place.address.length ? <span className="text-[12.5px] font-normal text-muted-foreground">{row.place.address.join(", ")}</span> : null}
        </Link>
      ),
    },
    { key: "renter", header: t("col.renter"), cell: (row) => (row.renter ? <PartyLink party={row.renter} /> : "—") },
    { key: "kind", header: t("col.kind"), cell: (row) => t(`kind.${row.kind}`) },
    { key: "planned", header: t("col.planned"), cell: (row) => (row.plannedDate ? formatDate(row.plannedDate, locale, "short") : t("notPlanned")) },
    { key: "checklist", header: t("col.checklist"), cell: (row) => <span className="num">{t("checkedOf", { checked: n(row.checked), checks: n(row.checks) })}</span> },
    { key: "status", header: t("col.status"), cell: (row) => <MoveStatusChip status={row.status} /> },
  ];

  return (
    <>
      <PageHeader title={tNav("moves")} sub={t("sub")} />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={LogIn} label={t("stats.moveIn")} value={n(list.open.moveIn)} tone="info" />
        <StatCard icon={LogOut} label={t("stats.moveOut")} value={n(list.open.moveOut)} tone="sun" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="kind" defaultValue={query.kind ?? ""} aria-label={t("col.kind")} className={`${inputClass} w-auto`}>
          <option value="">{t("allKinds")}</option>
          {MOVE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatuses")}</option>
          {MOVE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      {list.total === 0 && !query.q && !query.kind && !query.status ? (
        <Card flat className="mb-3.5 text-[13.5px] text-muted-foreground">
          {t("startHint")}
        </Card>
      ) : null}

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("moves")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/moves", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
