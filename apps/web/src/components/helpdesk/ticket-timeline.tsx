import { formatDate, type Locale, type TicketEvent, type TicketEventKind } from "@s57/shared";
import { Camera, CirclePlus, ClipboardList, MessageSquare, PencilLine, RefreshCw, UserRound, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";

const ICONS: Record<TicketEventKind, LucideIcon> = {
  created: CirclePlus,
  updated: PencilLine,
  assigned: UserRound,
  status: RefreshCw,
  comment: MessageSquare,
  photo: Camera,
  work_order: ClipboardList,
};

/** Ticket fields an edit may name, as `Helpdesk.field.*` labels. */
const FIELDS = ["locationId", "category", "title", "description", "priority", "reporterPersonId", "reporterName", "reporterPhone"] as const;
const isField = (field: string): field is (typeof FIELDS)[number] => (FIELDS as readonly string[]).includes(field);

/** The mockup's ticket timeline: what happened, oldest first, with who and when, notes and photos. */
export async function TicketTimeline({ events, locale }: { events: TicketEvent[]; locale: Locale }) {
  const t = await getTranslations("Helpdesk");

  const line = (event: TicketEvent): string => {
    const d = event.detail;
    switch (event.kind) {
      case "created":
        return d.staff ? t("event.createdFor", { name: d.staff }) : t("event.created");
      case "updated": {
        const fields = [...new Set((d.fields ?? []).filter(isField).map((field) => t(`field.${field}`)))];
        return fields.length > 0 ? t("event.updatedFields", { fields: fields.join(", ") }) : t("event.updated");
      }
      case "assigned":
        return d.staff ? t("event.assigned", { name: d.staff }) : t("event.unassigned");
      case "status":
        return d.to ? t("event.status", { status: t(`status.${d.to}`) }) : t("event.updated");
      case "comment":
        return t("event.comment");
      case "photo":
        return t("event.photo");
      case "work_order":
        return t(`event.workOrder.${d.workOrderStatus ?? "open"}`, { no: d.workOrderNo ?? "" });
    }
  };

  return (
    <Card className="grid gap-2.5">
      <h2 className="text-[15px]">{t("timeline")}</h2>
      <ol className="grid gap-3">
        {events.map((event) => {
          const Icon = ICONS[event.kind];
          return (
            <li key={event.id} className="flex gap-2.5 text-[13.5px]">
              <Icon aria-hidden className="mt-0.5 size-4 flex-none text-muted-foreground" />
              <div className="grid min-w-0 gap-1">
                <span className="font-semibold">{line(event)}</span>
                {event.note ? <p className="whitespace-pre-line">{event.note}</p> : null}
                {event.photoUrl ? (
                  <a href={event.photoUrl} target="_blank" rel="noreferrer" className="justify-self-start">
                    <Image src={event.thumbUrl ?? event.photoUrl} alt={t("photoAlt")} width={160} height={120} unoptimized className="h-auto w-40 rounded-md object-cover" />
                  </a>
                ) : null}
                <span className="num text-[12.5px] text-muted-foreground">
                  {[event.by?.name, formatDate(event.at, locale, "dateTime")].filter(Boolean).join(" · ")}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
