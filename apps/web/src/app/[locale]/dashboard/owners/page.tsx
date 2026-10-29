import { canAnywhere, canSocietyWide, formatNumber, localDigits, ownerRegisterQuery, type Locale, type OwnerRegisterRow } from "@s57/shared";
import { BadgeCheck, House, UserRound, UserX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { PartyLink, PlaceLink } from "@/components/members/labels";
import { MemberTicks, TickBox } from "@/components/members/make-members";
import { AreaNote, HoldingChips, PhoneActions, searchText } from "@/components/members/register-parts";
import { Button } from "@/components/ui/button";
import { getLocation } from "@/lib/api/property";
import { getOwnerRegister } from "@/lib/api/registers";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/owners">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.owners") };
}

/** Current owners in the caller's area, with their member number or a "not a member yet" badge. */
export default async function OwnersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/owners">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = ownerRegisterQuery.safeParse({
    q: searchText(search, "q"),
    membership: searchText(search, "membership"),
    residence: searchText(search, "residence"),
    areaId: searchText(search, "areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : ownerRegisterQuery.parse({ pageSize: PAGE_SIZE });

  const [t, tNav, list, area] = await Promise.all([
    getTranslations("Registers"),
    getTranslations("Dashboard.nav"),
    getOwnerRegister(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.membership ? { membership: query.membership } : {}),
    ...(query.residence ? { residence: query.residence } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);
  const placesOpen = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };
  // Whole-society roles can tick owners who aren't members yet and make them members in one go.
  const canTick = canSocietyWide(me.access, "members", "create");
  const tickable = (row: OwnerRegisterRow) => canTick && !row.isMember;

  const columns: Column<OwnerRegisterRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          {tickable(row) ? <TickBox id={row.id} name={row.name} /> : null}
          <Avatar name={row.name} src={row.photoUrl} />
          <div className="grid justify-items-start gap-0.5">
            <PartyLink party={row} />
            {row.membershipCode ? (
              <Chip tone="good">{t("memberNo", { no: row.membershipCode })}</Chip>
            ) : row.isMember ? (
              <Chip tone="warn">{t("idPending")}</Chip>
            ) : row.kind === "person" ? (
              <Chip tone="warn">{t("owners.notMember")}</Chip>
            ) : null}
          </div>
        </div>
      ),
    },
    { key: "holdings", header: t("col.holdings"), cell: (row) => <HoldingChips holdings={row.holdings} /> },
    {
      key: "place",
      header: t("owners.col.place"),
      cell: (row) => (
        <span className="whitespace-normal">
          <PlaceLink place={row.place} open={row.place.isUnit ? placesOpen.units : placesOpen.locations} />
          {row.otherPlaces > 0 ? <span className="text-muted-foreground"> {localDigits(t("morePlaces", { count: row.otherPlaces }), locale)}</span> : null}
        </span>
      ),
    },
    {
      key: "livesHere",
      header: t("owners.col.livesHere"),
      cell: (row) => (row.livesHere === null ? "—" : row.livesHere ? t("owners.yes") : <span className="text-muted-foreground">{t("owners.no")}</span>),
    },
    { key: "phone", header: t("col.phone"), cell: (row) => <PhoneActions phone={row.phone} name={row.name} /> },
  ];

  const table = (
    <DataTable columns={columns} rows={list.items} rowKey={(row) => `${row.kind}:${row.id}`} caption={tNav("owners")} empty={t("owners.empty")} />
  );

  return (
    <>
      <PageHeader title={tNav("owners")} sub={t("owners.sub")} />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={UserRound} label={t("owners.stats.owners")} value={n(list.counts.owners)} tone="acc" />
        <StatCard icon={BadgeCheck} label={t("owners.stats.members")} value={n(list.counts.members)} tone="info" />
        <StatCard icon={UserX} label={t("owners.stats.notMembers")} value={n(list.counts.notMembers)} tone="sun" />
        <StatCard icon={House} label={t("owners.stats.livesHere")} value={n(list.counts.livesHere)} tone="info" />
      </div>

      {query.areaId ? (
        <AreaNote name={area?.location?.name ?? null} clear={{ pathname: "/dashboard/owners", query: { ...filters, areaId: undefined } }} />
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("owners.searchLabel")} />
        <select name="membership" defaultValue={query.membership ?? ""} aria-label={t("owners.membershipLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("owners.anyMembership")}</option>
          <option value="member">{t("owners.membership.member")}</option>
          <option value="not_member">{t("owners.membership.not_member")}</option>
        </select>
        <select name="residence" defaultValue={query.residence ?? ""} aria-label={t("owners.col.livesHere")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("owners.anyResidence")}</option>
          <option value="here">{t("owners.residence.here")}</option>
          <option value="elsewhere">{t("owners.residence.elsewhere")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      {canTick ? (
        <MemberTicks eligible={list.items.filter(tickable).map((row) => ({ kind: row.kind, id: row.id }))}>{table}</MemberTicks>
      ) : (
        table
      )}

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/owners",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
