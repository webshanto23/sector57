import { canAnywhere, canSocietyWide, formatNumber, localDigits, MEMBER_ROLES, memberListQuery, type Locale, type MemberRow } from "@s57/shared";
import { House, Plus, ShieldCheck, UserRound, Users, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { MemberLinkText, PartyLink, PlaceLink, VerifiedChip } from "@/components/members/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMembers } from "@/lib/api/members";
import { getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.members") };
}

/** Owners, renters and households the caller may see: figures, search, filters, and a table that becomes cards on phones. */
export default async function MembersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/members">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = memberListQuery.safeParse({
    q: typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined,
    role: search["role"] || undefined,
    verification: search["verification"] || undefined,
    areaId: search["areaId"] || undefined,
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, list, area] = await Promise.all([
    getTranslations("Members"),
    getTranslations("Dashboard.nav"),
    getMembers(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.verification ? { verification: query.verification } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);
  const placesOpen = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };

  const columns: Column<MemberRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} />
          <div className="grid">
            <PartyLink party={row} />
            {row.nameEn && locale === "en" ? <span className="text-[12.5px] text-muted-foreground">{row.nameEn}</span> : null}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: t("col.role"),
      cell: (row) =>
        row.links.length === 0 ? (
          <span className="text-muted-foreground">{t("noLink")}</span>
        ) : (
          <span className="whitespace-normal">
            {row.links.map((link, index) => (
              <span key={index}>
                {index > 0 ? "; " : null}
                <MemberLinkText link={link} />
              </span>
            ))}
          </span>
        ),
    },
    {
      key: "place",
      header: t("col.place"),
      cell: (row) =>
        row.place ? (
          <span className="whitespace-normal">
            <PlaceLink place={row.place} open={row.place.isUnit ? placesOpen.units : placesOpen.locations} />
            {row.otherPlaces > 0 ? (
              <span className="text-muted-foreground"> {localDigits(t("morePlaces", { count: row.otherPlaces }), locale)}</span>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "phone", header: t("col.phone"), cell: (row) => (row.phone ? <span className="num">{localDigits(row.phone, locale)}</span> : "—") },
    {
      key: "id",
      header: t("col.id"),
      cell: (row) =>
        row.hasId ? (
          t(row.kind === "person" ? "idNid" : "idLicence")
        ) : (
          <span className="text-muted-foreground">{t("idMissing")}</span>
        ),
    },
    { key: "status", header: t("col.status"), cell: (row) => <VerifiedChip verified={row.verified} /> },
  ];

  return (
    <>
      <PageHeader
        title={tNav("members")}
        sub={t("sub")}
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
        <StatCard icon={UserRound} label={t("stats.owners")} value={n(list.counts.owners)} tone="acc" />
        <StatCard icon={House} label={t("stats.renterHouseholds")} value={n(list.counts.renterHouseholds)} tone="info" />
        <StatCard icon={Users} label={t("stats.bachelorRenters")} value={n(list.counts.bachelorRenters)} tone="info" />
        <StatCard icon={ShieldCheck} label={t("stats.pendingVerification")} value={n(list.counts.pendingVerification)} tone="sun" />
      </div>

      {query.areaId ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
          <Chip tone="info" plain>
            {area?.location ? t("inArea", { name: area.location.name }) : t("inSomeArea")}
          </Chip>
          <Link
            href={{ pathname: "/dashboard/members", query: { ...filters, areaId: undefined } }}
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
        <select name="role" defaultValue={query.role ?? ""} aria-label={t("col.role")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allRoles")}</option>
          {MEMBER_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roleFilter.${role}`)}
            </option>
          ))}
        </select>
        <select name="verification" defaultValue={query.verification ?? ""} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allVerification")}</option>
          <option value="pending">{t("verificationFilter.pending")}</option>
          <option value="verified">{t("verificationFilter.verified")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("members")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/members",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
