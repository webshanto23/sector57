"use client";

import { moneySchema, pick, type ExpenseHead, type Locale, type Vendor } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";

/** One expense line as the form holds it; `key` keeps React's list stable while lines come and go. */
export type LineValue = { key: string; headId: string; vendorId: string; description: string; amount: string };

/** True once the line has a head, a description and an amount above zero. */
export const lineReady = (line: LineValue): boolean => Boolean(line.headId) && line.description.trim() !== "" && moneySchema.safeParse(line.amount).success;

/** One item of an expense: head, amount, what it was for and its vendor. */
export function ExpenseLineCard({
  index,
  line,
  heads,
  vendors,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineValue;
  heads: ExpenseHead[];
  vendors: Vendor[];
  onChange: (next: LineValue) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("Expenses.form");
  const locale = useLocale() as Locale;
  const id = `line-${line.key}`;
  const badAmount = line.amount !== "" && !moneySchema.safeParse(line.amount).success;

  return (
    <Card role="group" className="grid gap-3" aria-label={t("lineLabel", { n: index + 1 })}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{t("lineLabel", { n: index + 1 })}</h2>
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={t("removeLine", { n: index + 1 })}>
            <Trash2 aria-hidden />
            {t("remove")}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("head")} htmlFor={`${id}-head`}>
          <select id={`${id}-head`} className={inputClass} value={line.headId} onChange={(e) => onChange({ ...line, headId: e.target.value })}>
            {heads.map((head) => (
              <option key={head.id} value={head.id}>
                {pick(head.nameBn, head.nameEn, locale)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount")} htmlFor={`${id}-amount`}>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            className={`${inputClass} num`}
            value={line.amount}
            aria-invalid={badAmount || undefined}
            onChange={(e) => onChange({ ...line, amount: e.target.value })}
          />
        </Field>
        <Field label={t("description")} htmlFor={`${id}-description`}>
          <input id={`${id}-description`} className={inputClass} value={line.description} maxLength={500} onChange={(e) => onChange({ ...line, description: e.target.value })} />
        </Field>
        <Field label={t("vendor")} htmlFor={`${id}-vendor`}>
          <select id={`${id}-vendor`} className={inputClass} value={line.vendorId} onChange={(e) => onChange({ ...line, vendorId: e.target.value })}>
            <option value="">{t("noVendor")}</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.service ? `${vendor.name} (${vendor.service})` : vendor.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {badAmount ? <p className="text-[13px] text-bad">{t("badAmount")}</p> : null}
    </Card>
  );
}
