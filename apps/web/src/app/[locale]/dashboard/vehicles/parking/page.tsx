import { formatNumber, PARKING_VIEWS, parkingListQuery, type Locale, type ParkingSlot } from "@s57/shared";
import { CircleParking, SquareParking } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AssigneeCell } from "@/components/vehicles/parking-assignee";
import { NewSlotForm } from "@/components/vehicles/parking-forms";
import { Link } from "@/i18n/navigation";
import { getParking } from "@/lib/api/vehicles";

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/parking">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Vehicles.tabs" });
  return { title: t("parking") };
}

/** Parking slots in the user's area: all in use by default, free, taken or removed; and a new one. */
export default async function ParkingPage({ params, searchParams }: PageProps<"/[locale]/dashboard/vehicles/parking">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = parkingListQuery.safeParse({ q: text("q"), view: text("view"), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : parkingListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tTabs, list] = await Promise.all([getTranslations("Vehicles.parking"), getTranslations("Vehicles.tabs"), getParking(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = { ...(query.q ? { q: query.q } : {}), ...(query.view !== "all" ? { view: query.view } : {}) };

  const columns: Column<ParkingSlot>[] = [
    {
      key: "code",
      header: t("code"),
      cell: (row) => (
        <Link href={`/dashboard/vehicles/parking/${row.id}`} className="grid font-semibold text-fg">
          <span className="num">{row.code}</span>
          {row.removedAt ? (
            <Chip tone="neutral" plain>
              {t("removed")}
            </Chip>
          ) : null}
        </Link>
      ),
    },
    { key: "place", header: t("place"), cell: (row) => [...row.place.address, row.place.name].join(", ") },
    { key: "assignee", header: t("assignee"), cell: (row) => (row.removedAt ? "—" : <AssigneeCell assignee={row.assignee} />) },
    { key: "note", header: t("note"), cell: (row) => row.note ?? "—" },
  ];

  return (
    <>
      <PageHeader title={tTabs("parking")} sub={t("sub")} />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={SquareParking} label={t("stats.slots")} value={formatNumber(list.counts.slots, locale)} tone="acc" />
        <StatCard icon={CircleParking} label={t("stats.free")} value={formatNumber(list.counts.free, locale)} tone="info" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="view" defaultValue={query.view} aria-label={t("viewLabel")} className={`${inputClass} sm:w-auto!`}>
          {PARKING_VIEWS.map((view) => (
            <option key={view} value={view}>
              {t(`view.${view}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tTabs("parking")} empty={Object.keys(filters).length ? t("empty") : t("start")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/vehicles/parking", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />

      {list.can.create ? (
        <div className="mt-3.5">
          <NewSlotForm />
        </div>
      ) : null}
    </>
  );
}
