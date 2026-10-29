import { formatDate, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
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
import { OccupancyChip, propertyTrail } from "@/components/property/labels";
import { UnitForm } from "@/components/property/unit-form";
import { unitTypeName } from "@/components/property/unit-types";
import { VehiclesPanel } from "@/components/vehicles/vehicles-panel";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLocationPeople } from "@/lib/api/members";
import { getSociety } from "@/lib/api/public";
import { getUnit, getUnitTypes } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/units/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("units");
  const unit = await getUnit(id);
  return unit ? { title: unit.name } : {};
}

/** One unit: where it is, its facts, and who owns, rents and lives in it. */
export default async function UnitPage({ params }: PageProps<"/[locale]/dashboard/units/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("units");
  const [t, unit, people, unitTypes, society] = await Promise.all([
    getTranslations("Property"),
    getUnit(id),
    getLocationPeople(id),
    getUnitTypes(),
    getSociety(),
  ]);
  if (!unit) notFound();

  return (
    <>
      <DashboardBreadcrumb visible={visibleNavKeys(me.access)} tail={propertyTrail(unit.breadcrumb, unit.name)} />
      <PageHeader
        title={unit.name}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {unitTypeName(unitTypes, unit.unitType, locale as Locale)}
            <OccupancyChip occupancy={unit.occupancy} />
            {unit.covers.length > 0 ? (
              <Chip tone="info">{t("storeys.floors", { floors: [unit.breadcrumb.at(-1)?.name, ...unit.covers.map((storey) => storey.name)].filter(Boolean).join(" + ") })}</Chip>
            ) : null}
          </span>
        }
        actions={
          <Link href="/dashboard/units" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("units.back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {unit.mergedInto ? (
          <Note>
            <Link href={`/dashboard/units/${unit.mergedInto.id}`} className="font-semibold underline-offset-2 hover:underline">
              {t("storeys.mergedInto", { name: unit.mergedInto.name, date: formatDate(unit.mergedInto.on, locale as Locale, "short") })}
            </Link>
          </Note>
        ) : !unit.can.edit ? (
          <Note>{t("readOnly")}</Note>
        ) : null}
        <UnitForm key={unit.id} unit={unit} unitTypes={unitTypes} />
        {people ? <PeoplePanel key={`people-${unit.id}`} people={people} idsRequired={society?.requireIdNumbers ?? false} /> : null}
        <BillsPanel access={me.access} locale={locale as Locale} unitId={unit.id} />
        <VehiclesPanel access={me.access} locale={locale as Locale} unitId={unit.id} />
        <CertificatesPanel access={me.access} locale={locale as Locale} unitId={unit.id} />
        <DocumentsPanel access={me.access} entityType="location" entityId={unit.id} />
      </div>
    </>
  );
}
