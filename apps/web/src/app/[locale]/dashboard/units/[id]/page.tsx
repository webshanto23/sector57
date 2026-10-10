import { canAnywhere, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PageHeader } from "@/components/kit";
import { OccupancyChip, PropertyBreadcrumb } from "@/components/property/labels";
import { UnitForm } from "@/components/property/unit-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUnit } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/units/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("units");
  const unit = await getUnit(id);
  return unit ? { title: unit.name } : {};
}

/** One unit: where it is and its facts. */
export default async function UnitPage({ params }: PageProps<"/[locale]/dashboard/units/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("units");
  const [t, unit] = await Promise.all([getTranslations("Property"), getUnit(id)]);
  if (!unit) notFound();

  return (
    <>
      <PropertyBreadcrumb crumbs={unit.breadcrumb} current={unit.name} mapOpen={canAnywhere(me.access, "locations")} />
      <PageHeader
        title={unit.name}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t(`unitType.${unit.unitType}`)}
            <OccupancyChip occupancy={unit.occupancy} />
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
        {!unit.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <UnitForm key={unit.id} unit={unit} />
      </div>
    </>
  );
}
