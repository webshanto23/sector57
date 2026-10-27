import { canAnywhere, collectionRegisterQuery, formatDate, formatNumber, formatTaka, largestColumn, pick, PAYMENT_METHODS, type Access, type CollectionRegisterQuery, type LocationNode, type Locale } from "@s57/shared";
import { Banknote, Trophy, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Field, inputClass, StatCard } from "@/components/kit";
import { canExportReport, canSeeReport } from "@/components/reports/access";
import { RegisterGrid } from "@/components/reports/register-grid";
import { RegisterPrint } from "@/components/reports/register-print";
import { RegisterTable } from "@/components/reports/register-table";
import { ReportHeader } from "@/components/reports/report-header";
import { Button } from "@/components/ui/button";
import { getLocation, getTopLocations } from "@/lib/api/property";
import { csvHref, getCollectionRegister } from "@/lib/api/reports";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/collection-register">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.collectionRegister" });
  return { title: t("title") };
}

/** The places to filter by: the society's blocks (the children of its single top level), or the caller's own areas. */
async function placeOptions(access: Access): Promise<LocationNode[]> {
  if (!canAnywhere(access, "locations")) return [];
  const top = await getTopLocations();
  let places = top.children;
  const [only] = places;
  if (places.length === 1 && only && only.childCount > 0) places = (await getLocation(only.id))?.children ?? places;
  return places.filter((place) => place.isActive && !place.isUnit);
}

/** One month of receipts, day by day, one column per charge (Step 33). */
export default async function CollectionRegisterPage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/collection-register">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me || !canSeeReport(me.access, "collection-register")) notFound();
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  // The form always sends `filtered`; an unticked box then means "hide voided". A bare link shows them.
  const voided = text("filtered") ? String(text("voided") === "true") : undefined;
  const parsed = collectionRegisterQuery.safeParse({
    month: text("month"),
    locationId: text("locationId"),
    collectorId: text("collectorId"),
    method: text("method"),
    voided,
  });
  const query: Partial<CollectionRegisterQuery> = parsed.success ? parsed.data : {};
  const [t, tReports, tMethod, found, places] = await Promise.all([
    getTranslations("Reports.collectionRegister"),
    getTranslations("Reports"),
    getTranslations("Finance.method"),
    getCollectionRegister(query),
    placeOptions(me.access),
  ]);
  const report = found ?? (await getCollectionRegister({}));
  if (!report) notFound();
  const shown: Partial<CollectionRegisterQuery> = found ? query : {};

  const money = (amount: string) => formatTaka(amount, locale);
  const voidedShown = shown.voided ?? true;
  // Collectors come from the month's receipts; a chosen one stays listed while it filters the rows.
  const collectors = new Map(report.days.flatMap((day) => day.rows.map((row) => [row.collector.id, row.collector.name] as const)));
  const largest = largestColumn(report.columns, report.totals);
  const largestColumnDef = largest ? report.columns.find((column) => column.key === largest.key) : undefined;
  const largestName = largestColumnDef
    ? largestColumnDef.kind === "donation"
      ? t("col.donation")
      : pick(largestColumnDef.nameBn ?? "", largestColumnDef.nameEn, locale)
    : null;
  const monthLabel = formatDate(`${report.month}-01`, locale, "monthYear");
  // The print's subtitle: "Sep 2026 · All areas · All collectors", plus the method when one is chosen.
  const place = shown.locationId ? places.find((option) => option.id === shown.locationId)?.name : t("allPlaces");
  const filters = [
    monthLabel,
    place,
    shown.collectorId ? collectors.get(shown.collectorId) : t("allCollectors"),
    shown.method ? tMethod(shown.method) : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub", { month: monthLabel })}
        csv={
          canExportReport(me.access, "collection-register")
            ? csvHref("collection-register", {
                month: report.month,
                locationId: shown.locationId,
                collectorId: shown.collectorId,
                method: shown.method,
                voided: String(voidedShown),
                lang: locale,
              })
            : null
        }
        actions={
          report.days.length > 0 ? (
            <RegisterPrint header={report.header} filters={filters}>
              <RegisterGrid report={report} locale={locale} variant="print" />
            </RegisterPrint>
          ) : null
        }
      />

      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="filtered" value="1" />
        <Field label={t("month")} htmlFor="register-month">
          <input id="register-month" type="month" name="month" defaultValue={report.month} className={`${inputClass} sm:w-auto!`} />
        </Field>
        {places.length > 0 ? (
          <Field label={t("place")} htmlFor="register-place">
            <select id="register-place" name="locationId" defaultValue={shown.locationId ?? ""} className={`${inputClass} sm:w-auto!`}>
              <option value="">{t("allPlaces")}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={t("collector")} htmlFor="register-collector">
          <select id="register-collector" name="collectorId" defaultValue={shown.collectorId ?? ""} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("allCollectors")}</option>
            {[...collectors].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("method")} htmlFor="register-method">
          <select id="register-method" name="method" defaultValue={shown.method ?? ""} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("allMethods")}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {tMethod(method)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex h-10 items-center gap-2 text-[13.5px] text-muted-foreground">
          <input type="checkbox" name="voided" value="true" defaultChecked={voidedShown} className="size-4 accent-[var(--accent-brand)]" />
          {t("voided")}
        </label>
        <Button type="submit" variant="outline">
          {tReports("show")}
        </Button>
      </form>
      {!found ? (
        <div className="mb-3.5">
          <Note tone="warn">{t("invalid")}</Note>
        </div>
      ) : null}

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-3">
        <StatCard
          icon={Banknote}
          tone="acc"
          label={t("stats.collected")}
          value={money(report.totals.total)}
          note={t("stats.collectedNote", { receipts: report.totals.receipts, days: report.activeDays })}
        />
        <StatCard
          icon={Trophy}
          label={largestName ?? t("stats.largest")}
          value={largest ? money(largest.amount) : "–"}
          note={largest ? t("stats.largest") : t("stats.largestNone")}
        />
        <StatCard icon={UserPlus} tone="info" label={t("stats.newMembers")} value={formatNumber(report.newMembers, locale)} note={t("stats.newMembersNote")} />
      </div>
      <RegisterTable report={report} locale={locale} />
    </>
  );
}
