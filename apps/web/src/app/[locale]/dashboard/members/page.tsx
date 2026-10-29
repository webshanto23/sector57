import {
  canAnywhere,
  canSocietyWide,
  formatDate,
  formatNumber,
  formatTaka,
  MEMBER_FEE_FILTERS,
  MEMBERSHIP_STATUSES,
  memberRegisterQuery,
  type Locale,
  type MemberFee,
  type MemberRegisterRow,
  type MembershipStatus,
} from "@s57/shared";
import { BadgeCheck, CircleSlash, Clock, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column, type Tone } from "@/components/kit";
import { PartyLink } from "@/components/members/labels";
import { AreaNote, HoldingChips, PhoneActions, searchText } from "@/components/members/register-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLocation } from "@/lib/api/property";
import { getMemberRegister } from "@/lib/api/registers";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;
const STATUS_TONES: Record<MembershipStatus, Tone> = { active: "good", lapsed: "warn", cancelled: "neutral" };

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.members") };
}

/** The society's registered members (memberships) in the caller's area, active ones first. */
export default async function MembersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/members">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = memberRegisterQuery.safeParse({
    q: searchText(search, "q"),
    status: searchText(search, "status"),
    fee: searchText(search, "fee"),
    areaId: searchText(search, "areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : memberRegisterQuery.parse({ pageSize: PAGE_SIZE });

  const [t, tNav, list, area] = await Promise.all([
    getTranslations("Registers"),
    getTranslations("Dashboard.nav"),
    getMemberRegister(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.status !== "active" ? { status: query.status } : {}),
    ...(query.fee ? { fee: query.fee } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);
  // The fee shows only to society-wide billing viewers (the API sends null otherwise).
  const feeShown = list.counts.feeNotPaid !== null;
  const canBill = canSocietyWide(me.access, "billing", "create");
  const feeCell = (fee: MemberFee, member: MemberRegisterRow["person"]) => {
    if (fee.state === "paid") return <Chip tone="good">{t("members.fee.paid")}</Chip>;
    if (fee.state === "unpaid") {
      return (
        <Link href={`/dashboard/billing/${fee.openBillId}`} className="whitespace-nowrap">
          <Chip tone="warn">{t("members.fee.unpaid", { amount: formatTaka(fee.owed ?? "0", locale) })}</Chip>
        </Link>
      );
    }
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Chip tone="bad">{t("members.fee.notBilled")}</Chip>
        {canBill ? (
          <Link href={{ pathname: "/dashboard/billing/new", query: member.kind === "person" ? { personId: member.id } : { organisationId: member.id } }} className="text-[13px] font-semibold whitespace-nowrap text-primary">
            {t("members.fee.makeBill")}
          </Link>
        ) : null}
      </span>
    );
  };

  const columns: Column<MemberRegisterRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.person.name} src={row.person.photoUrl} />
          <div className="grid">
            <PartyLink party={row.person} />
            <span className="num text-[12.5px] text-muted-foreground">{t("memberNo", { no: row.membershipCode })}</span>
          </div>
        </div>
      ),
    },
    { key: "holdings", header: t("col.holdings"), cell: (row) => <HoldingChips holdings={row.holdings} /> },
    { key: "phone", header: t("col.phone"), cell: (row) => <PhoneActions phone={row.person.phone} name={row.person.name} /> },
    { key: "joined", header: t("members.col.joined"), cell: (row) => <span className="whitespace-nowrap">{formatDate(row.joinedOn, locale, "short")}</span> },
    { key: "status", header: t("col.status"), cell: (row) => <Chip tone={STATUS_TONES[row.status]}>{t(`members.status.${row.status}`)}</Chip> },
    ...(feeShown
      ? [{ key: "fee", header: t("members.col.fee"), cell: (row: MemberRegisterRow) => (row.fee ? feeCell(row.fee, row.person) : "—") }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={tNav("members")}
        sub={t("members.sub")}
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

      <div className={`mb-3.5 grid grid-cols-2 gap-2.5 ${feeShown ? "min-[900px]:grid-cols-4" : "min-[900px]:grid-cols-3"}`}>
        <StatCard icon={BadgeCheck} label={t("members.status.active")} value={n(list.counts.active)} tone="acc" />
        <StatCard icon={Clock} label={t("members.status.lapsed")} value={n(list.counts.lapsed)} tone="sun" />
        <StatCard icon={CircleSlash} label={t("members.status.cancelled")} value={n(list.counts.cancelled)} tone="info" />
        {list.counts.feeNotPaid !== null ? (
          <StatCard icon={ReceiptText} label={t("members.fee.notPaidCount")} value={n(list.counts.feeNotPaid)} tone="sun" />
        ) : null}
      </div>

      {query.areaId ? (
        <AreaNote name={area?.location?.name ?? null} clear={{ pathname: "/dashboard/members", query: { ...filters, areaId: undefined } }} />
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("members.searchLabel")} />
        <select name="status" defaultValue={query.status} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          {MEMBERSHIP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`members.status.${status}`)}
            </option>
          ))}
        </select>
        {feeShown ? (
          <select name="fee" defaultValue={query.fee ?? ""} aria-label={t("members.col.fee")} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("members.fee.any")}</option>
            {MEMBER_FEE_FILTERS.map((fee) => (
              <option key={fee} value={fee}>
                {t(`members.fee.filter.${fee}`)}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => String(row.memberNo)} caption={tNav("members")} empty={t("members.empty")} />

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
