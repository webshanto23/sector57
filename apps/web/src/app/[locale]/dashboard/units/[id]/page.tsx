import { canAnywhere, formatDate, pickLocationTab, unitTabs, type Locale, type UnitTab } from "@s57/shared";
import { ArrowRightLeft, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPanel } from "@/components/billing/bills-panel";
import { CertificatesPanel } from "@/components/certificates/certificates-panel";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { DashboardBreadcrumb } from "@/components/dashboard/dashboard-breadcrumb";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { Chip, PageHeader } from "@/components/kit";
import { PeoplePanel } from "@/components/members/people-panel";
import { propertyTrail } from "@/components/property/labels";
import { LocationTabBar } from "@/components/property/location-tab-bar";
import { SeparateButton } from "@/components/property/separate-button";
import { UnitForm } from "@/components/property/unit-form";
import { UnitStats } from "@/components/property/unit-stats";
import { unitTypeName } from "@/components/property/unit-types";
import { VehiclesPanel } from "@/components/vehicles/vehicles-panel";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoices } from "@/lib/api/billing";
import { getCertificates } from "@/lib/api/certificates";
import { getDocuments } from "@/lib/api/documents";
import { getLocationPeople } from "@/lib/api/members";
import { getSociety } from "@/lib/api/public";
import { getUnit, getUnitTypes } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";
import { getVehicles } from "@/lib/api/vehicles";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/units/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("units");
  const unit = await getUnit(id);
  return unit ? { title: unit.name } : {};
}

/** One unit: its summary, then who is connected to it, its bills, and the rest as tabs (`tab` in the URL). */
export default async function UnitPage({ params, searchParams }: PageProps<"/[locale]/dashboard/units/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("units");
  const search = await searchParams;
  const may = (module: Parameters<typeof canAnywhere>[1]) => canAnywhere(me.access, module);
  const [t, tMembers, tBilling, tVehicles, tCertificates, unit, people, unitTypes, bills, vehicles, certificates, documents] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Members"),
    getTranslations("Billing"),
    getTranslations("Vehicles"),
    getTranslations("Certificates"),
    getUnit(id),
    getLocationPeople(id),
    getUnitTypes(),
    may("billing") ? getInvoices({ unitId: id, pageSize: 1 }) : Promise.resolve(null),
    may("vehicles") ? getVehicles({ unitId: id, pageSize: 1 }) : Promise.resolve(null),
    may("certificates") ? getCertificates({ unitId: id, pageSize: 1 }) : Promise.resolve(null),
    may("documents") ? getDocuments({ entityType: "location", entityId: id, pageSize: 1 }) : Promise.resolve(null),
  ]);
  if (!unit) notFound();

  const transfer = search["transfer"] === "1" && people?.location.canOwn === true;
  const tabs = unitTabs({ people: people !== null, bills: bills !== null, vehicles: vehicles !== null, certificates: certificates !== null, documents: documents !== null });
  const active = pickLocationTab(tabs, transfer ? "people" : search["tab"]);
  const society = active === "people" ? await getSociety() : null;
  const ownerships = people?.can.ownerships;
  const canTransfer = people?.location.canOwn === true && people.owners !== null && ownerships?.create === true && ownerships.edit;
  const stillHere = <Row extends { endDate: string | null }>(rows: Row[] | null | undefined) => rows?.filter((row) => row.endDate === null).length ?? 0;
  const tabItems: Record<UnitTab, { label: string; count?: number }> = {
    people: { label: t("pageTabs.people"), count: stillHere(people?.location.canOwn ? people.owners : null) + stillHere(people?.tenancies) + stillHere(people?.occupants) },
    bills: { label: tBilling("panel.title"), count: bills?.total },
    vehicles: { label: tVehicles("panel.title"), count: vehicles?.total },
    certificates: { label: tCertificates("panel.title"), count: certificates?.total },
    documents: { label: t("pageTabs.documents"), count: documents?.total },
    details: { label: t("pageTabs.details") },
  };
  const [storey, building] = [...unit.breadcrumb].reverse();
  const place = [storey?.name, building?.name].filter(Boolean).join(", ");

  return (
    <>
      <DashboardBreadcrumb visible={visibleNavKeys(me.access)} tail={propertyTrail(unit.breadcrumb, unit.name)} />
      <PageHeader
        title={unit.name}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {[unitTypeName(unitTypes, unit.unitType, locale), place].filter(Boolean).join(" · ")}
            <Chip tone={unit.isActive ? "good" : "warn"}>{unit.isActive ? t("active") : t("inactive")}</Chip>
            {unit.covers.length > 0 ? (
              <Chip tone="info">{t("storeys.floors", { floors: [unit.breadcrumb.at(-1)?.name, ...unit.covers.map((storey) => storey.name)].filter(Boolean).join(" + ") })}</Chip>
            ) : null}
          </span>
        }
        actions={
          <>
            {canTransfer ? (
              <Link href={{ pathname: `/dashboard/units/${id}`, query: { tab: "people", transfer: "1" } }} className={buttonVariants({ variant: "outline" })}>
                <ArrowRightLeft aria-hidden />
                {tMembers("people.transfer")}
              </Link>
            ) : null}
            <Link href="/dashboard/units" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("units.back")}
            </Link>
          </>
        }
      />
      <div className="grid gap-3.5">
        {unit.mergedInto ? (
          <>
            <Note>
              <Link href={`/dashboard/units/${unit.mergedInto.id}`} className="font-semibold underline-offset-2 hover:underline">
                {t("storeys.mergedInto", { name: unit.mergedInto.name, date: formatDate(unit.mergedInto.on, locale, "short") })}
              </Link>
            </Note>
            {unit.can.separate ? <SeparateButton key={unit.id} id={unit.id} name={unit.name} from={unit.mergedInto.name} /> : null}
          </>
        ) : !unit.can.edit ? (
          <Note>{t("readOnly")}</Note>
        ) : null}
        <UnitStats people={people} occupancy={unit.occupancy} outstanding={bills?.totals.outstanding ?? null} locale={locale} />
      </div>
      <LocationTabBar pathname={`/dashboard/units/${id}`} tabs={tabs.map((tab) => ({ id: tab, ...tabItems[tab] }))} active={active} locale={locale} />
      <div className="grid gap-3.5">
        {active === "people" && people ? <PeoplePanel key={`people-${unit.id}`} people={people} idsRequired={society?.requireIdNumbers ?? false} tab transfer={transfer} /> : null}
        {active === "bills" ? <BillsPanel access={me.access} locale={locale} unitId={unit.id} /> : null}
        {active === "vehicles" ? <VehiclesPanel access={me.access} locale={locale} unitId={unit.id} /> : null}
        {active === "certificates" ? <CertificatesPanel access={me.access} locale={locale} unitId={unit.id} /> : null}
        {active === "documents" ? <DocumentsPanel access={me.access} entityType="location" entityId={unit.id} split /> : null}
        {active === "details" ? <UnitForm key={unit.id} unit={unit} unitTypes={unitTypes} /> : null}
      </div>
    </>
  );
}
