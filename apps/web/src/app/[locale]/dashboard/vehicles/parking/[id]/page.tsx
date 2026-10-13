import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { AssigneeCell } from "@/components/vehicles/parking-assignee";
import { AssignCard, RemoveSlotButton, SlotEditor } from "@/components/vehicles/parking-forms";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";
import { getParkingSlot } from "@/lib/api/vehicles";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/parking/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("vehicles");
  const slot = await getParkingSlot(id);
  return slot ? { title: slot.code } : {};
}

/** One parking slot: where it is, who holds it, its code and note, and taking it out of use. */
export default async function ParkingSlotPage({ params }: PageProps<"/[locale]/dashboard/vehicles/parking/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("vehicles");
  const [t, slot] = await Promise.all([getTranslations("Vehicles.parking"), getParkingSlot(id)]);
  if (!slot) notFound();
  const inUse = slot.removedAt === null;

  return (
    <>
      <PageHeader
        title={<span className="num">{slot.code}</span>}
        sub={[...slot.place.address, slot.place.name].join(", ")}
        actions={
          <Link href="/dashboard/vehicles/parking" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!inUse ? <Note tone="warn">{t("removedNote")}</Note> : !slot.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {inUse && slot.can.edit ? (
            <SlotEditor key={slot.id} slot={slot} />
          ) : (
            <Card className="grid content-start gap-1.5 text-[13.5px]">
              <h2 className="text-[15px]">{t("details")}</h2>
              <p>{slot.note ?? "—"}</p>
            </Card>
          )}
          <div className="grid content-start gap-3.5">
            <Card className="grid gap-2">
              <h2 className="text-[15px]">{t("assignee")}</h2>
              {inUse ? <AssigneeCell assignee={slot.assignee} /> : <p>—</p>}
            </Card>
            {inUse && slot.can.edit ? <AssignCard key={slot.assignee?.kind ?? "free"} slot={slot} /> : null}
            {inUse && slot.can.remove ? <RemoveSlotButton slot={slot} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}
