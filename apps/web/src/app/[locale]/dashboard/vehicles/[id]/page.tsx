import { canAnywhere, formatDate, type Locale, type VehicleDetail } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { RemoveVehicleCard, VehicleEditor } from "@/components/vehicles/vehicle-forms";
import { VehicleStickers } from "@/components/vehicles/vehicle-stickers";
import { VehicleHolder } from "@/components/vehicles/vehicles-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";
import { getStickers, getStickerSettings, getVehicle } from "@/lib/api/vehicles";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("vehicles");
  const vehicle = await getVehicle(id);
  return vehicle ? { title: vehicle.regNo } : {};
}

/** One vehicle: its details, the unit and person it belongs to, its stickers, and removing it. */
export default async function VehiclePage({ params }: PageProps<"/[locale]/dashboard/vehicles/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("vehicles");
  const [t, vehicle] = await Promise.all([getTranslations("Vehicles"), getVehicle(id)]);
  if (!vehicle) notFound();
  const [stickers, settings] = await Promise.all([getStickers({ q: vehicle.regNo, pageSize: 50 }), getStickerSettings()]);
  const history = stickers.items.filter((row) => row.vehicle.id === vehicle.id);
  const unit = { id: vehicle.place.id, name: [...vehicle.place.address, vehicle.place.name].join(", ") };
  const onFile = vehicle.removedAt === null;

  return (
    <>
      <PageHeader
        title={<span className="num">{vehicle.regNo}</span>}
        sub={[t(`kind.${vehicle.kind}`), vehicle.make, vehicle.colour].filter(Boolean).join(" · ")}
        actions={
          <Link href="/dashboard/vehicles" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!onFile ? (
          <Note tone="warn">{t("removedNote", { date: formatDate(vehicle.removedAt!, locale, "short"), reason: vehicle.removeReason ?? "" })}</Note>
        ) : !vehicle.can.edit ? (
          <Note>{t("readOnly")}</Note>
        ) : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {onFile && vehicle.can.edit ? (
            <VehicleEditor key={vehicle.id} vehicle={vehicle} unit={unit} />
          ) : (
            <Summary vehicle={vehicle} unit={unit.name} locale={locale} personLink={canAnywhere(me.access, "members")} t={t} />
          )}
          <div className="grid content-start gap-3.5">
            <VehicleStickers
              key={vehicle.sticker?.id ?? "none"}
              vehicle={vehicle}
              history={history}
              can={{ issue: canAnywhere(me.access, "vehicles", "create"), revoke: vehicle.can.edit }}
              fee={settings.settings.fee?.amount ?? null}
            />
            {onFile && vehicle.can.remove ? <RemoveVehicleCard vehicle={vehicle} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** The vehicle as text, for those who may only look (or once it is removed). */
function Summary({
  vehicle,
  unit,
  locale,
  personLink,
  t,
}: {
  vehicle: VehicleDetail;
  unit: string;
  locale: Locale;
  personLink: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"Vehicles">>>;
}) {
  const rows: [string, ReactNode][] = [
    [t("kindLabel"), t(`kind.${vehicle.kind}`)],
    [t("make"), vehicle.make ?? "—"],
    [t("colour"), vehicle.colour ?? "—"],
    [t("col.unit"), unit],
    [t("person"), <VehicleHolder key="holder" vehicle={vehicle} locale={locale} link={personLink} />],
    [t("note"), vehicle.note ?? "—"],
  ];
  return (
    <Card className="grid content-start gap-2">
      <h2 className="text-[15px]">{t("details")}</h2>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
