import {
  canAnywhere,
  formatNumber,
  formatTaka,
  INVOICE_FILTERS,
  INVOICE_KINDS,
  invoiceListQuery,
  localDigits,
  toPaisa,
  type Locale,
} from "@s57/shared";
import { CircleCheck, Clock, Plus, Receipt, TriangleAlert, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BillsTable } from "@/components/billing/bills-table";
import { Pager } from "@/components/cms/pager";
import { Chip, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoices } from "@/lib/api/billing";
import { getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/billing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.billing") };
}

/** The mockup's bills page: four figures, search and filters, and a table that becomes cards on phones. */
export default async function BillingPage({ params, searchParams }: PageProps<"/[locale]/dashboard/billing">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("billing");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = invoiceListQuery.safeParse({
    q: text("q"),
    status: text("status"),
    kind: text("kind"),
    month: text("month"),
    areaId: text("areaId"),
    unitId: text("unitId"),
    personId: text("personId"),
    organisationId: text("organisationId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, list, area] = await Promise.all([
    getTranslations("Billing"),
    getTranslations("Dashboard.nav"),
    getInvoices(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.month ? { month: query.month } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
    ...(query.organisationId ? { organisationId: query.organisationId } : {}),
  };
  const filtered = Object.keys(filters).length > 0;
  const { totals } = list;
  const n = (value: number) => formatNumber(value, locale);
  // Collected as a share of billed, in whole percent, on whole paisa (no floats).
  const billedPaisa = toPaisa(totals.billed);
  const percent = billedPaisa > BigInt(0) ? (toPaisa(totals.collected) * BigInt(100)) / billedPaisa : null;

  return (
    <>
      <PageHeader
        title={tNav("billing")}
        sub={t("sub")}
        actions={
          canAnywhere(me.access, "billing", "create") ? (
            <Link href="/dashboard/billing/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("newBill")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard
          icon={Receipt}
          label={t("stat.billed")}
          value={formatTaka(totals.billed, locale)}
          note={t("stat.billedNote", { count: n(totals.billedCount) })}
        />
        <StatCard
          icon={CircleCheck}
          label={t("stat.collected")}
          value={formatTaka(totals.collected, locale)}
          note={percent === null ? undefined : `${localDigits(String(percent), locale)}%`}
          tone="acc"
        />
        <StatCard
          icon={Clock}
          label={t("stat.outstanding")}
          value={formatTaka(totals.outstanding, locale)}
          note={totals.overdueCount ? t("stat.overdueNote", { count: n(totals.overdueCount) }) : undefined}
          tone="warn"
        />
        <StatCard
          icon={TriangleAlert}
          label={t("stat.earlierArrears")}
          value={formatTaka(totals.earlierArrears, locale)}
          note={t("stat.arrearsUnits", { count: n(totals.earlierArrearsUnits) })}
          tone="sun"
        />
      </div>

      {query.areaId ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
          <Chip tone="info" plain>
            {area?.location ? t("inArea", { name: area.location.name }) : t("inSomeArea")}
          </Chip>
          <Link
            href={{ pathname: "/dashboard/billing", query: { ...filters, areaId: undefined } }}
            className="inline-flex items-center gap-1 font-semibold text-primary"
          >
            <X className="size-3.5" aria-hidden />
            {t("clearArea")}
          </Link>
        </p>
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {(["areaId", "unitId", "personId", "organisationId"] as const).map((key) =>
          query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null,
        )}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatus")}</option>
          {INVOICE_FILTERS.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={query.kind ?? ""} aria-label={t("col.charge")} className={`${inputClass} w-auto`}>
          <option value="">{t("allKinds")}</option>
          {INVOICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
        <input type="month" name="month" defaultValue={query.month ?? ""} aria-label={t("monthLabel")} className={`${inputClass} w-auto`} />
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <BillsTable rows={list.items} locale={locale} empty={filtered ? t("emptyFiltered") : t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/billing",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
