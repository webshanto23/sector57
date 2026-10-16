"use client";

import {
  addMoney,
  formatTaka,
  localDigits,
  MAX_INVOICE_LINES,
  moneySchema,
  pick,
  type BillingLookup,
  type ChargeTypeList,
  type InvoiceBatchCheck,
  type Locale,
} from "@s57/shared";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, Chip, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";

export type BatchLine = { key: number; chargeTypeId: string; amount: string };
/** A unit as found by the search or chosen from the list. */
export type BatchUnitInfo = Pick<BillingLookup["units"][number], "id" | "name" | "code" | "address" | "isActive" | "billTo">;
export type BatchUnit = { unit: BatchUnitInfo; lines: BatchLine[] };
type Checked = InvoiceBatchCheck["units"][number];
type ChargeType = ChargeTypeList["items"][number];

/** A new line with the first charge type and its usual amount. */
export function newBatchLine(key: number, active: ChargeType[]): BatchLine {
  const first = active[0];
  return { key, chargeTypeId: first?.id ?? "", amount: first?.defaultAmount ?? "" };
}

/** The unit's total, or null while an amount is not a valid sum of money. */
export function linesTotal(lines: BatchLine[]): string | null {
  const parsed = lines.map((line) => moneySchema.safeParse(line.amount));
  return parsed.every((r) => r.success) ? addMoney("0", ...parsed.map((r) => (r.success ? r.data : "0"))) : null;
}

/**
 * One unit of a batch: who it bills (as last looked up), its own lines, and once checked,
 * the bills per fund, earlier bills that look the same, and anything that stops it.
 */
export function BatchUnitCard({
  index,
  item,
  active,
  checked,
  failed,
  nextKey,
  onChange,
  onRemove,
  onCopyAbove,
}: {
  index: number;
  item: BatchUnit;
  active: ChargeType[];
  checked: Checked | null;
  failed: string | null;
  nextKey: () => number;
  onChange: (lines: BatchLine[]) => void;
  onRemove: () => void;
  onCopyAbove: (() => void) | null;
}) {
  const t = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const { unit, lines } = item;
  const typeOf = (id: string) => active.find((type) => type.id === id);
  const total = linesTotal(lines);
  const billTo = checked?.billTo ?? unit.billTo;
  const id = (key: number) => `batch-${unit.id}-${key}`;

  function setLine(at: number, change: Partial<BatchLine>) {
    onChange(lines.map((line, i) => (i === at ? { ...line, ...change } : line)));
  }

  function changeType(at: number, chargeTypeId: string) {
    const line = lines[at]!;
    // An untouched amount follows the charge type's usual amount.
    const before = typeOf(line.chargeTypeId)?.defaultAmount ?? "";
    const amount = line.amount === "" || line.amount === before ? (typeOf(chargeTypeId)?.defaultAmount ?? "") : line.amount;
    setLine(at, { chargeTypeId, amount });
  }

  return (
    <Card className={`grid gap-3 ${checked?.problem || failed ? "border-bad" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            <span className="text-muted-foreground">{localDigits(index + 1, locale)}. </span>
            {unit.name}
          </p>
          <p className="text-[13px] text-muted-foreground">{unit.address.join(", ")}</p>
          <p className="text-[13px]">
            {billTo ? t("new.billsTo", { name: pick(billTo.name, billTo.nameEn, locale), role: t(`role.${billTo.role}`) }) : t("new.nobody")}
          </p>
        </div>
        <div className="flex gap-1.5">
          {onCopyAbove ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCopyAbove}>
              <Copy aria-hidden />
              {t("batch.copyAbove")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("batch.removeUnit")} title={t("batch.removeUnit")} onClick={onRemove}>
            <X aria-hidden />
          </Button>
        </div>
      </div>

      <ul className="grid gap-2">
        {lines.map((line, at) => {
          const ok = moneySchema.safeParse(line.amount).success;
          return (
            <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2">
              <select
                id={`${id(line.key)}-type`}
                aria-label={t("new.chargeType")}
                className={inputClass}
                value={line.chargeTypeId}
                onChange={(e) => changeType(at, e.target.value)}
              >
                {active.map((type) => (
                  <option key={type.id} value={type.id}>
                    {pick(type.nameBn, type.nameEn, locale)}
                  </option>
                ))}
              </select>
              <input
                id={`${id(line.key)}-amount`}
                aria-label={t("new.amount")}
                inputMode="decimal"
                className={`${inputClass} num`}
                value={line.amount}
                aria-invalid={(line.amount !== "" && !ok) || undefined}
                onChange={(e) => setLine(at, { amount: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("new.removeLine")}
                title={t("new.removeLine")}
                disabled={lines.length === 1}
                onClick={() => onChange(lines.filter((_, i) => i !== at))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {lines.length < MAX_INVOICE_LINES ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newBatchLine(nextKey(), active)])}>
            <Plus aria-hidden />
            {t("new.addLine")}
          </Button>
        ) : (
          <span />
        )}
        <p className="text-[13.5px]">
          {t("batch.unitTotal")}: <b className="num">{total ? formatTaka(total, locale) : "—"}</b>
        </p>
      </div>

      {checked && checked.bills.length > 1 ? (
        <p className="text-[13px] text-muted-foreground">
          {t("batch.split", {
            count: localDigits(checked.bills.length, locale),
            funds: checked.bills.map((bill) => `${pick(bill.fund.nameBn, bill.fund.nameEn, locale)} ${formatTaka(bill.total, locale)}`).join(", "),
          })}
        </p>
      ) : null}
      {checked?.warnings.length ? (
        <div className="grid gap-1 rounded-[8px] bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {checked.warnings.map((warning) => (
            <p key={warning.invoiceId}>
              {t("batch.warning", {
                no: warning.invoiceNo,
                charges: warning.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", "),
              })}
            </p>
          ))}
          <p>{t("batch.warningHint")}</p>
        </div>
      ) : null}
      {checked?.problem ? <Chip tone="bad">{t(`batch.problem.${checked.problem}`)}</Chip> : null}
      {failed ? <p className="text-[13px] text-bad">{failed}</p> : null}
    </Card>
  );
}
