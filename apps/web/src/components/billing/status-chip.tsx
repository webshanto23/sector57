import type { InvoiceRow, InvoiceStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const STATUS_TONES: Record<InvoiceStatus, Tone> = { unpaid: "warn", partial: "info", paid: "good", void: "neutral" };

/** Paid, unpaid, part paid or void; an open bill past its due date shows as overdue. Server or client. */
export function InvoiceStatusChip({ row }: { row: Pick<InvoiceRow, "status" | "overdue"> }) {
  const t = useTranslations("Billing.status");
  return row.overdue ? <Chip tone="bad">{t("overdue")}</Chip> : <Chip tone={STATUS_TONES[row.status]}>{t(row.status)}</Chip>;
}
