import { canAnywhere, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { NewVehicleForm, type UnitLabel } from "@/components/vehicles/vehicle-forms";
import { Link } from "@/i18n/navigation";
import { getUnit } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Vehicles" });
  return { title: t("newTitle") };
}

/** A new vehicle at a unit in the user's `vehicles.create` area (`?unitId=` from a unit page fixes the unit). */
export default async function NewVehiclePage({ params, searchParams }: PageProps<"/[locale]/dashboard/vehicles/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("vehicles", "create");
  const requested = (await searchParams)["unitId"];
  const [t, found] = await Promise.all([
    getTranslations("Vehicles"),
    typeof requested === "string" && canAnywhere(me.access, "units") ? getUnit(requested).catch(() => null) : Promise.resolve(null),
  ]);
  const unit: UnitLabel | null = found ? { id: found.id, name: [...found.breadcrumb.map((crumb) => crumb.name), found.name].join(", ") } : null;

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href={unit ? `/dashboard/units/${unit.id}` : "/dashboard/vehicles"} className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewVehicleForm unit={unit} />
    </>
  );
}
