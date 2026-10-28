import {
  canAnywhere,
  canSocietyWide,
  formatDate,
  formatNumber,
  OPEN_TENANCY_STATUSES,
  RENTER_TYPES,
  renterRegisterQuery,
  type Locale,
  type RenterRegisterRow,
} from "@s57/shared";
import { FileWarning, House, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { PartyLink, PlaceLink, TenancyStatusChip } from "@/components/members/labels";
import { AreaNote, PhoneActions, searchText } from "@/components/members/register-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLocation, getUnitTypes } from "@/lib/api/property";
import { getRenterRegister } from "@/lib/api/registers";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/renters">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.renters") };
}

/** Open tenancies in the caller's area: who rents which unit, since when, and what is still missing. */
export default async function RentersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/renters">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = renterRegisterQuery.safeParse({
    q: searchText(search, "q"),
    renterType: searchText(search, "renterType"),
    unitType: searchText(search, "unitType"),
    status: searchText(search, "status"),
    areaId: searchText(search, "areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : renterRegisterQuery.parse({ pageSize: PAGE_SIZE });

  const [t, tMembers, tNav, list, unitTypes, area] = await Promise.all([
    getTranslations("Registers"),
    getTranslations("Members"),
    getTranslations("Dashboard.nav"),
    getRenterRegister(query),
    getUnitTypes(),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.renterType ? { renterType: query.renterType } : {}),
    ...(query.unitType ? { unitType: query.unitType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);
  const unitsOpen = canAnywhere(me.access, "units");
  const movesOpen = canAnywhere(me.access, "tenancies");
  const named = (item: { nameBn: string; nameEn: string | null }) => (locale === "en" ? (item.nameEn ?? item.nameBn) : item.nameBn);

  const columns: Column<RenterRegisterRow>[] = [
    {
      key: "renter",
      header: t("renters.col.renter"),
      cell: (row) =>
        row.renter ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.renter.name} />
            <div className="grid">
              <PartyLink party={row.renter} />
              <span className="text-[12.5px] text-muted-foreground">{tMembers(`renterType.${row.renterType}`)}</span>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">{t("renters.noRenter")}</span>
        ),
    },
    {
      key: "unit",
      header: t("renters.col.unit"),
      cell: (row) => (
        <span className="grid whitespace-normal">
          <PlaceLink place={row.unit} open={unitsOpen} />
          <span className="text-[12.5px] text-muted-foreground">{named(row.unitType)}</span>
        </span>
      ),
    },
    { key: "since", header: t("renters.col.since"), cell: (row) => <span className="whitespace-nowrap">{formatDate(row.startDate, locale, "short")}</span> },
    { key: "residents", header: t("renters.col.residents"), numeric: true, cell: (row) => <span className="num">{n(row.residents)}</span> },
    {
      key: "policeForm",
      header: t("renters.col.policeForm"),
      cell: (row) =>
        row.policeFormSubmitted ? <Chip tone="good">{t("renters.policeForm.done")}</Chip> : <Chip tone="warn">{t("renters.policeForm.missing")}</Chip>,
    },
    {
      key: "status",
      header: t("col.status"),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <TenancyStatusChip status={row.status} />
          {row.openMove && movesOpen ? (
            <Link href={`/dashboard/moves/${row.openMove.id}`} className="text-[12.5px] font-semibold text-primary underline-offset-2 hover:underline">
              {t("renters.openMove")}
            </Link>
          ) : null}
        </span>
      ),
    },
    { key: "phone", header: t("col.phone"), cell: (row) => (row.renter ? <PhoneActions phone={row.renter.phone} name={row.renter.name} /> : "—") },
  ];

  return (
    <>
      <PageHeader
        title={tNav("renters")}
        sub={t("renters.sub")}
        actions={
          // Adding someone not linked to a unit is for whole-society roles; others add people from a unit.
          canSocietyWide(me.access, "members", "create") ? (
            <Link href="/dashboard/members/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("add")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={House} label={t("renters.stats.renters")} value={n(list.counts.renters)} tone="acc" />
        <StatCard icon={Users} label={t("renters.stats.family")} value={n(list.counts.family)} tone="info" />
        <StatCard icon={Users} label={t("renters.stats.bachelor")} value={n(list.counts.bachelor)} tone="info" />
        <StatCard icon={FileWarning} label={t("renters.stats.policeFormMissing")} value={n(list.counts.policeFormMissing)} tone="sun" />
      </div>

      {query.areaId ? (
        <AreaNote name={area?.location?.name ?? null} clear={{ pathname: "/dashboard/renters", query: { ...filters, areaId: undefined } }} />
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("renters.searchLabel")} />
        <select name="renterType" defaultValue={query.renterType ?? ""} aria-label={t("renters.renterTypeLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("renters.anyRenterType")}</option>
          {RENTER_TYPES.map((type) => (
            <option key={type} value={type}>
              {tMembers(`renterType.${type}`)}
            </option>
          ))}
        </select>
        <select name="unitType" defaultValue={query.unitType ?? ""} aria-label={t("renters.unitTypeLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("renters.anyUnitType")}</option>
          {unitTypes.map((type) => (
            <option key={type.code} value={type.code}>
              {named(type)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("renters.anyStatus")}</option>
          {OPEN_TENANCY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tMembers(`tenancyStatus.${status}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.tenancyId} caption={tNav("renters")} empty={t("renters.empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/renters",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
