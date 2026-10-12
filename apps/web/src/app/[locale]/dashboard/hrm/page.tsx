import { canAnywhere, formatDate, formatNumber, localDigits, pick, STAFF_KINDS, STAFF_STATES, staffListQuery, type Locale, type StaffRow } from "@s57/shared";
import { Download, IdCard, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Avatar, Card, Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getMe } from "@/lib/api/session";
import { csvHref, getStaffList } from "@/lib/api/staff";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.hrm") };
}

/** Staff in the user's area: current ones by default, filtered by designation, kind and place. */
export default async function StaffPage({ params, searchParams }: PageProps<"/[locale]/dashboard/hrm">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me) notFound();
  if (!canAnywhere(me.access, "staff")) redirect({ href: "/dashboard/hrm/attendance", locale });

  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = staffListQuery.safeParse({
    q: text("q"),
    designation: text("designation"),
    kind: text("kind"),
    state: text("state"),
    areaId: text("areaId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : staffListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tNav, list] = await Promise.all([getTranslations("Staff"), getTranslations("Dashboard.nav"), getStaffList(query)]);
  if (!list) notFound();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.designation ? { designation: query.designation } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.state !== "current" ? { state: query.state } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };

  const columns: Column<StaffRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      cell: (row) => (
        <Link href={`/dashboard/hrm/${row.id}`} className="flex items-center gap-2.5 font-semibold text-fg">
          <Avatar name={row.person.name} />
          <span className="grid">
            {pick(row.person.name, row.person.nameEn, locale)}
            <span className="num text-[12.5px] font-normal text-muted-foreground">
              {[t("staffNo", { no: localDigits(row.staffNo, locale) }), row.person.phone ? localDigits(row.person.phone, locale) : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
      ),
    },
    { key: "designation", header: t("col.designation"), cell: (row) => pick(row.designation.bn, row.designation.en, locale) },
    { key: "kind", header: t("col.kind"), cell: (row) => t(`kind.${row.kind}`) },
    { key: "posted", header: t("col.posted"), cell: (row) => [...row.posted.address, row.posted.name].join(", ") },
    {
      key: "since",
      header: t("col.since"),
      cell: (row) =>
        row.leftOn ? (
          <Chip>{t("leftOnShort", { date: formatDate(row.leftOn, locale, "short") })}</Chip>
        ) : (
          <span className="num">{formatDate(row.joinedOn, locale, "short")}</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={tNav("hrm")}
        sub={t("sub")}
        actions={
          <>
            {list.can.export ? (
              <a href={csvHref("/staff/csv", { ...filters, lang: locale })} className={buttonVariants({ variant: "outline" })}>
                <Download aria-hidden />
                {t("csv")}
              </a>
            ) : null}
            {list.can.create ? (
              <Link href="/dashboard/hrm/new" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("add")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={IdCard} label={t("stats.current")} value={formatNumber(list.current, locale)} tone="info" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="designation" defaultValue={query.designation ?? ""} aria-label={t("col.designation")} className={`${inputClass} w-auto`}>
          <option value="">{t("allDesignations")}</option>
          {list.designations.map((designation) => (
            <option key={designation.bn} value={designation.bn}>
              {pick(designation.bn, designation.en, locale)}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={query.kind ?? ""} aria-label={t("col.kind")} className={`${inputClass} w-auto`}>
          <option value="">{t("allKinds")}</option>
          {STAFF_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
        <select name="state" defaultValue={query.state} aria-label={t("stateLabel")} className={`${inputClass} w-auto`}>
          {STAFF_STATES.map((state) => (
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

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("hrm")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/hrm", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
