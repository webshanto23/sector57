import { FACILITY_KINDS, FACILITY_STATES, facilityListQuery, formatNumber, pick, type FacilityRow, type Locale } from "@s57/shared";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Card, Chip, DataTable, inputClass, PageHeader, SearchInput, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFacilities } from "@/lib/api/facilities";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.facilities") };
}

/** The facilities in the user's area: in use by default, or the archived ones. */
export default async function FacilitiesPage({ params, searchParams }: PageProps<"/[locale]/dashboard/facilities">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = facilityListQuery.safeParse({ q: text("q"), kind: text("kind"), state: text("state"), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : facilityListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tNav, list] = await Promise.all([getTranslations("Facilities"), getTranslations("Dashboard.nav"), getFacilities(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.state !== "current" ? { state: query.state } : {}),
  };

  const columns: Column<FacilityRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <Link href={`/dashboard/facilities/${row.id}`} className="grid font-semibold text-fg">
          {pick(row.name.bn, row.name.en, locale)}
          <span className="text-[12.5px] font-normal text-muted-foreground">{t(`kind.${row.kind}`)}</span>
        </Link>
      ),
    },
    { key: "place", header: t("col.place"), cell: (row) => [...row.place.address, row.place.name].join(", ") },
    {
      key: "assets",
      header: t("col.assets"),
      cell: (row) => (
        <Link href={{ pathname: "/dashboard/facilities/assets", query: { facilityId: row.id } }} className="num">
          {formatNumber(row.assets, locale)}
        </Link>
      ),
    },
    { key: "fund", header: t("col.fund"), cell: (row) => (row.fund ? pick(row.fund.name.bn, row.fund.name.en, locale) : "—") },
    {
      key: "state",
      header: t("col.state"),
      cell: (row) =>
        row.archivedAt ? <Chip>{t("archived")}</Chip> : row.bookable ? <Chip tone="info">{t("bookable")}</Chip> : <Chip tone="good">{t("inUse")}</Chip>,
    },
  ];

  return (
    <>
      <PageHeader
        title={tNav("facilities")}
        sub={t("sub")}
        actions={
          list.can.create ? (
            <Link href="/dashboard/facilities/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("add")}
            </Link>
          ) : null
        }
      />

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="kind" defaultValue={query.kind ?? ""} aria-label={t("kindLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allKinds")}</option>
          {FACILITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
        <select name="state" defaultValue={query.state} aria-label={t("stateLabel")} className={`${inputClass} sm:w-auto!`}>
          {FACILITY_STATES.map((state) => (
            <option key={state} value={state}>
              {t(`state.${state}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      {list.total === 0 && Object.keys(filters).length === 0 ? (
        <Card flat className="mb-3.5 text-[13.5px] text-muted-foreground">
          {t("startHint")}
        </Card>
      ) : null}

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("facilities")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/facilities", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
