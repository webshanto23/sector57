import { formatDate, isTicketActive, type Locale, type TicketPriority, type TicketStatus, type WorkOrderStatus } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const STATUS_TONES: Record<TicketStatus, Tone> = {
  open: "info",
  assigned: "acc",
  in_progress: "warn",
  resolved: "good",
  closed: "neutral",
  cancelled: "neutral",
};
const PRIORITY_TONES: Record<TicketPriority, Tone> = { low: "neutral", normal: "info", high: "warn", urgent: "bad" };
const WORK_TONES: Record<WorkOrderStatus, Tone> = { open: "info", in_progress: "warn", done: "good", cancelled: "neutral" };

/** A ticket's status as a coloured chip. */
export function TicketStatusChip({ status }: { status: TicketStatus }) {
  const t = useTranslations("Helpdesk.status");
  return <Chip tone={STATUS_TONES[status]}>{t(status)}</Chip>;
}

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  const t = useTranslations("Helpdesk.priority");
  return (
    <Chip tone={PRIORITY_TONES[priority]} plain>
      {t(priority)}
    </Chip>
  );
}

/** When a ticket is due: red once past, nothing once it is no longer waiting. */
export function DueChip({ status, dueAt, overdue }: { status: TicketStatus; dueAt: string; overdue: boolean }) {
  const t = useTranslations("Helpdesk");
  const locale = useLocale() as Locale;
  if (!isTicketActive(status)) return null;
  const date = formatDate(dueAt, locale, "dateTime");
  return overdue ? <Chip tone="bad">{t("overdueSince", { date })}</Chip> : <Chip tone="neutral">{t("dueBy", { date })}</Chip>;
}

/** A work order's status as a coloured chip. */
export function WorkOrderStatusChip({ status }: { status: WorkOrderStatus }) {
  const t = useTranslations("WorkOrders.status");
  return <Chip tone={WORK_TONES[status]}>{t(status)}</Chip>;
}
