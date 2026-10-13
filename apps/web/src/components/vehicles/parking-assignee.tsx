import type { ParkingAssignee } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/kit";
import { Link } from "@/i18n/navigation";

const placeLine = (place: { address: string[]; name: string }) => [...place.address, place.name].join(", ");

/** Who holds a slot: a unit, a vehicle (linked) with its unit, or "free". */
export function AssigneeCell({ assignee }: { assignee: ParkingAssignee | null }) {
  const t = useTranslations("Vehicles.parking");
  if (!assignee) return <Chip tone="good">{t("freeChip")}</Chip>;
  if (assignee.kind === "unit") return <span>{t("toUnit", { unit: placeLine(assignee.place) })}</span>;
  return (
    <span className="grid">
      <Link href={`/dashboard/vehicles/${assignee.id}`} className="num font-semibold text-fg">
        {assignee.regNo}
      </Link>
      <span className="text-[12.5px] text-muted-foreground">{placeLine(assignee.place)}</span>
    </span>
  );
}
