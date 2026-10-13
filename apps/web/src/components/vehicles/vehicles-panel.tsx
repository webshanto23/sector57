import { canAnywhere, localDigits, type Access, type Locale } from "@s57/shared";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getVehicles } from "@/lib/api/vehicles";
import { VehiclesTable } from "./vehicles-table";

const SHOWN = 10;

/** The vehicles on file of a unit or of a person, within the caller's vehicles area. A unit page also offers a new one. */
export async function VehiclesPanel({ access, locale, unitId, personId }: { access: Access; locale: Locale; unitId?: string; personId?: string }) {
  if (!canAnywhere(access, "vehicles")) return null;
  const [t, list] = await Promise.all([getTranslations("Vehicles"), getVehicles({ unitId, personId, pageSize: SHOWN })]);
  const filter = unitId ? { unitId } : { personId: personId! };

  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("panel.title")}</h2>
        {unitId && list.can.create ? (
          <Link href={{ pathname: "/dashboard/vehicles/new", query: { unitId } }} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus aria-hidden />
            {t("add")}
          </Link>
        ) : null}
      </div>
      <VehiclesTable
        rows={list.items}
        locale={locale}
        empty={t("panel.empty")}
        hide={unitId ? ["unit"] : ["person"]}
        personLinks={canAnywhere(access, "members")}
      />
      {list.total > list.items.length ? (
        <Link href={{ pathname: "/dashboard/vehicles", query: filter }} className="justify-self-start text-[13.5px] font-semibold text-primary">
          {t("panel.more", { count: localDigits(list.total - list.items.length, locale) })}
        </Link>
      ) : null}
    </Card>
  );
}
