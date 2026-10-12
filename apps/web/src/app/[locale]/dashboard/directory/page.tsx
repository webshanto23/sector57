import { canAnywhere, directoryQuery, formatNumber, localDigits, type DirectoryRow, type Locale } from "@s57/shared";
import { Download, House, Printer, Users, X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Chip, DataTable, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { PlaceLink } from "@/components/members/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { directoryCsvHref, getDirectory } from "@/lib/api/moves";
import { getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/directory">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.directory") };
}

/** Everyone living in a unit now, in the user's area, in address order; search, print and CSV. */
export default async function DirectoryPage({ params, searchParams }: PageProps<"/[locale]/dashboard/directory">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = directoryQuery.safeParse({ q: text("q"), areaId: text("areaId"), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, tNav, tMembers, list, area] = await Promise.all([
    getTranslations("Directory"),
    getTranslations("Dashboard.nav"),
    getTranslations("Members"),
    getDirectory(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  if (!list) notFound();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = { ...(query.q ? { q: query.q } : {}), ...(query.areaId ? { areaId: query.areaId } : {}) };
  const n = (value: number) => formatNumber(value, locale);
  const unitsOpen = canAnywhere(me.access, "units");

  const columns: Column<DirectoryRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.person.name} />
          <div className="grid">
            <Link href={`/dashboard/members/${row.person.id}`} className="font-semibold text-fg underline-offset-2 hover:underline">
              {row.person.name}
            </Link>
            {row.person.nameEn && locale === "en" ? <span className="text-[12.5px] text-muted-foreground">{row.person.nameEn}</span> : null}
          </div>
        </div>
      ),
    },
    { key: "place", header: t("col.place"), cell: (row) => <PlaceLink place={row.place} open={unitsOpen} /> },
    {
      key: "relation",
      header: t("col.relation"),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{tMembers(`relation.${row.relation}`)}</span>
          <span className="text-[12.5px] text-muted-foreground">· {t(`household.${row.household}`)}</span>
          {row.isOwner ? <Chip tone="acc">{t("owner")}</Chip> : null}
        </span>
      ),
    },
    { key: "phone", header: t("col.phone"), cell: (row) => (row.person.phone ? <span className="num">{localDigits(row.person.phone, locale)}</span> : "—") },
    { key: "member", header: t("col.member"), cell: (row) => (row.memberNo !== null ? <span className="num">{n(row.memberNo)}</span> : "—") },
  ];

  return (
    <>
      <PageHeader
        title={tNav("directory")}
        sub={t("sub")}
        actions={
          <>
            <Link href={{ pathname: "/dashboard/directory/print", query: filters }} className={buttonVariants({ variant: "outline" })}>
              <Printer aria-hidden />
              {t("print")}
            </Link>
            {canAnywhere(me.access, "members", "export") ? (
              <a href={directoryCsvHref({ ...filters, lang: locale })} className={buttonVariants({ variant: "outline" })}>
                <Download aria-hidden />
                {t("csv")}
              </a>
            ) : null}
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={House} label={t("stats.units")} value={n(list.counts.units)} tone="info" />
        <StatCard icon={Users} label={t("stats.residents")} value={n(list.counts.residents)} tone="acc" />
      </div>

      {query.areaId ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
          <Chip tone="info" plain>
            {area?.location ? t("inArea", { name: area.location.name }) : t("inSomeArea")}
          </Chip>
          <Link
            href={{ pathname: "/dashboard/directory", query: { ...filters, areaId: undefined } }}
            className="inline-flex items-center gap-1 font-semibold text-primary"
          >
            <X className="size-3.5" aria-hidden />
            {t("clearArea")}
          </Link>
        </p>
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("directory")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/directory", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
