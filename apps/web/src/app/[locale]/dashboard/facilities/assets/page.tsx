import { ASSET_STATES, assetListQuery, formatNumber, pick, type AssetRow, type Locale } from "@s57/shared";
import { CalendarClock, Download, Plus, PlugZap, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { AssetStatusChip } from "@/components/facilities/asset-status";
import { DueChip } from "@/components/facilities/plans-card";
import { Card, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { assetsCsvHref, getAssetOptions, getAssets } from "@/lib/api/facilities";
import { todayInDhaka } from "@/lib/dhaka-time";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/assets">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Facilities.tabs" });
  return { title: t("assets") };
}

/** Assets in the user's area: in use or under repair by default, by status, category or facility. */
export default async function AssetsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/facilities/assets">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = assetListQuery.safeParse({
    q: text("q"),
    state: text("state"),
    category: text("category"),
    facilityId: text("facilityId"),
    areaId: text("areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : assetListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tTabs, list, options] = await Promise.all([getTranslations("Assets"), getTranslations("Facilities.tabs"), getAssets(query), getAssetOptions()]);
  if (!list) notFound();
  const today = todayInDhaka();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.state !== "active" ? { state: query.state } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.facilityId ? { facilityId: query.facilityId } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };

  const columns: Column<AssetRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <Link href={`/dashboard/facilities/assets/${row.id}`} className="flex items-center gap-2.5 font-semibold text-fg">
          {row.thumbUrl ? <Image src={row.thumbUrl} alt="" width={36} height={36} unoptimized className="size-9 flex-none rounded-md object-cover" /> : null}
          <span className="grid">
            {pick(row.name.bn, row.name.en, locale)}
            <span className="num text-[12.5px] font-normal text-muted-foreground">
              {row.assetNo} · {row.category}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: "where",
      header: t("col.where"),
      cell: (row) => (
        <span className="grid">
          {row.facility ? <span>{pick(row.facility.name.bn, row.facility.name.en, locale)}</span> : null}
          <span className={row.facility ? "text-[12.5px] text-muted-foreground" : undefined}>{[...row.place.address, row.place.name].join(", ")}</span>
        </span>
      ),
    },
    {
      key: "custodian",
      header: t("col.custodian"),
      cell: (row) => (row.custodian ? pick(row.custodian.name, row.custodian.nameEn, locale) : "—"),
    },
    { key: "status", header: t("col.status"), cell: (row) => <AssetStatusChip status={row.status} /> },
    { key: "due", header: t("col.due"), cell: (row) => (row.nextDueOn ? <DueChip nextDueOn={row.nextDueOn} today={today} /> : "—") },
  ];

  return (
    <>
      <PageHeader
        title={tTabs("assets")}
        sub={t("sub")}
        actions={
          <>
            {list.can.export ? (
              <a href={assetsCsvHref({ ...filters, lang: locale })} className={buttonVariants({ variant: "outline" })}>
                <Download aria-hidden />
                {t("csv")}
              </a>
            ) : null}
            {list.can.create ? (
              <Link
                href={{ pathname: "/dashboard/facilities/assets/new", query: query.facilityId ? { facilityId: query.facilityId } : {} }}
                className={buttonVariants()}
              >
                <Plus aria-hidden />
                {t("add")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={PlugZap} label={t("stats.inUse")} value={formatNumber(list.counts.inUse, locale)} tone="acc" />
        <StatCard icon={Wrench} label={t("stats.repair")} value={formatNumber(list.counts.repair, locale)} tone="warn" />
        <Link href="/dashboard/facilities/maintenance" className="contents">
          <StatCard icon={CalendarClock} label={t("stats.due")} value={formatNumber(list.counts.due, locale)} tone="info" />
        </Link>
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="facilityId" defaultValue={query.facilityId ?? ""} aria-label={t("facility")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allFacilities")}</option>
          {options.facilities.map((facility) => (
            <option key={facility.id} value={facility.id}>
              {pick(facility.name.bn, facility.name.en, locale)}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={query.category ?? ""} aria-label={t("category")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allCategories")}</option>
          {list.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select name="state" defaultValue={query.state} aria-label={t("stateLabel")} className={`${inputClass} sm:w-auto!`}>
          {ASSET_STATES.map((state) => (
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

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tTabs("assets")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/facilities/assets", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
