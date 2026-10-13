import { formatDate, type AssetEvent, type AssetEventKind, type Locale } from "@s57/shared";
import { ArrowRightLeft, Camera, CirclePlus, PencilLine, RefreshCw, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";

const ICONS: Record<AssetEventKind, LucideIcon> = {
  created: CirclePlus,
  updated: PencilLine,
  moved: ArrowRightLeft,
  custodian: UserRound,
  status: RefreshCw,
  maintenance: Wrench,
  photo: Camera,
};

/** Fields an edit may name, as `Assets.field.*` labels. */
const FIELDS = ["nameBn", "nameEn", "category", "purchasedOn", "purchaseCost", "vendorId", "expenseId", "warrantyUntil", "note"] as const;
type FieldKey = (typeof FIELDS)[number];
const isField = (value: string): value is FieldKey => (FIELDS as readonly string[]).includes(value);

/** The asset's history, newest first, as the office recorded it then. */
export async function AssetHistory({ events, locale }: { events: AssetEvent[]; locale: Locale }) {
  const t = await getTranslations("Assets");

  const line = (event: AssetEvent): string => {
    const d = event.detail;
    switch (event.kind) {
      case "created":
        return d.place ? t("event.createdAt", { place: d.place }) : t("event.created");
      case "moved":
        return t("event.moved", { place: d.place ?? "" });
      case "custodian":
        return d.custodian ? t("event.custodian", { name: d.custodian }) : t("event.custodianCleared");
      case "status":
        return d.status
          ? d.on
            ? t("event.statusOn", { status: t(`status.${d.status}`), date: formatDate(d.on, locale, "short") })
            : t("event.status", { status: t(`status.${d.status}`) })
          : t("event.updated");
      case "maintenance":
        return t("event.maintenance", { task: d.task ?? "", date: d.doneOn ? formatDate(d.doneOn, locale, "short") : "" });
      case "photo":
        return t("event.photo");
      case "updated":
        return d.fields && d.fields.length > 0 ? t("event.updatedFields", { fields: d.fields.filter(isField).map((field) => t(`field.${field}`)).join(", ") }) : t("event.updated");
    }
  };

  return (
    <Card className="grid gap-2.5">
      <h2 className="text-[15px]">{t("historyTitle")}</h2>
      {events.length === 0 ? <p className="text-[13px] text-muted-foreground">{t("historyNone")}</p> : null}
      <ol className="grid gap-2.5">
        {events.map((event) => {
          const Icon = ICONS[event.kind];
          return (
            <li key={event.id} className="flex gap-2.5 text-[13.5px]">
              <Icon aria-hidden className="mt-0.5 size-4 flex-none text-muted-foreground" />
              <div className="grid">
                <span>{line(event)}</span>
                {event.note ? <span className="text-muted-foreground">{event.note}</span> : null}
                <span className="num text-[12px] text-muted-foreground">
                  {[formatDate(event.at, locale, "stamp"), event.by?.name].filter(Boolean).join(" · ")}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[12px] text-muted-foreground">{t("historyHint")}</p>
    </Card>
  );
}
