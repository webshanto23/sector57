import { formatDate, pick, type BillToSnapshot, type InvoiceRow, type InvoiceStatus, type Locale } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Chip, type Tone } from "@/components/kit";

const STATUS_TONES: Record<InvoiceStatus, Tone> = { unpaid: "warn", partial: "info", paid: "good", void: "neutral" };

/** Paid, unpaid, part paid or void; an open bill past its due date shows as overdue. */
export async function InvoiceStatusChip({ row }: { row: Pick<InvoiceRow, "status" | "overdue"> }) {
  const t = await getTranslations("Billing.status");
  return row.overdue ? <Chip tone="bad">{t("overdue")}</Chip> : <Chip tone={STATUS_TONES[row.status]}>{t(row.status)}</Chip>;
}

type Translate = (key: string, values?: Record<string, string>) => string;

/** "Oct 2026", or "Oct 2026 to Dec 2026"; null when the bill has no period. */
export function periodLabel(row: Pick<InvoiceRow, "periodStart" | "periodEnd">, locale: Locale, t: Translate): string | null {
  if (!row.periodStart) return null;
  const from = formatDate(row.periodStart, locale, "monthYear");
  const to = row.periodEnd ? formatDate(row.periodEnd, locale, "monthYear") : from;
  return from === to ? from : t("periodRange", { from, to });
}

/** "Flat 4B, Road 9": the unit and the place right above it, as billed. */
export function unitLabel(billTo: BillToSnapshot): string | null {
  if (!billTo.unit) return null;
  const above = billTo.unit.address.at(-1);
  return above ? `${billTo.unit.name}, ${above}` : billTo.unit.name;
}

/** "Rokeya Begum (owner)". */
export function billToLabel(billTo: BillToSnapshot, locale: Locale, t: Translate): string {
  return t("billToWithRole", { name: pick(billTo.name, billTo.nameEn, locale), role: t(`role.${billTo.role}`) });
}
