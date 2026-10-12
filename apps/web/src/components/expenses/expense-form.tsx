"use client";

import { moneySchema, pick, type ExpenseDetail, type ExpenseInputValues, type ExpenseOptions, type Locale } from "@s57/shared";
import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/**
 * A new expense request, or changes to a pending one (`expense`). Archived heads and vendors
 * are offered only when the expense already uses them. The fund picker shows only while the
 * society keeps separate funds. Vouchers are attached on the expense's page once saved.
 */
export function ExpenseForm({ options, expense, today, onDone }: { options: ExpenseOptions; expense?: ExpenseDetail; today: string; onDone?: () => void }) {
  const t = useTranslations("Expenses.form");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const heads = options.heads.filter((head) => !head.archived || head.id === expense?.head.id);
  const vendors = options.vendors.filter((vendor) => !vendor.archived || vendor.id === expense?.vendor?.id);
  const defaultFund = options.funds.find((fund) => fund.isDefault) ?? options.funds[0];
  const funds = expense && !options.funds.some((fund) => fund.id === expense.fund.id) ? [{ ...expense.fund, isDefault: false }, ...options.funds] : options.funds;

  const [headId, setHeadId] = useState(expense?.head.id ?? heads[0]?.id ?? "");
  const [fundId, setFundId] = useState(expense?.fund.id ?? defaultFund?.id ?? "");
  const [vendorId, setVendorId] = useState(expense?.vendor?.id ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? today);
  const parsed = moneySchema.safeParse(amount);
  const ready = Boolean(headId) && description.trim() !== "" && parsed.success && spentOn !== "";

  async function save() {
    if (!ready || !parsed.success) return;
    const body: ExpenseInputValues = {
      headId,
      fundId: options.separateFunds || (expense && expense.fund.id !== defaultFund?.id) ? fundId : null,
      vendorId: vendorId || null,
      description,
      amount: parsed.data,
      spentOn,
    };
    const saved = await run(() => (expense ? api.PATCH("/expenses/{id}", { params: { path: { id: expense.id } }, body }) : api.POST("/expenses", { body })));
    if (!saved) return;
    if (expense) onDone?.();
    else router.push(`/dashboard/expenses/${saved.id}`);
  }

  if (heads.length === 0) return <Card className="text-muted-foreground">{t("noHeads")}</Card>;

  return (
    <form
      noValidate
      className="grid max-w-[760px] gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="grid gap-3">
        <div className="grid gap-3 min-[600px]:grid-cols-2">
          <Field label={t("head")} htmlFor="expense-head">
            <select id="expense-head" className={inputClass} value={headId} onChange={(e) => setHeadId(e.target.value)}>
              {heads.map((head) => (
                <option key={head.id} value={head.id}>
                  {pick(head.nameBn, head.nameEn, locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("amount")} htmlFor="expense-amount">
            <input
              id="expense-amount"
              inputMode="decimal"
              className={`${inputClass} num`}
              value={amount}
              aria-invalid={(amount !== "" && !parsed.success) || undefined}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <div className="min-[600px]:col-span-2">
            <Field label={t("description")} htmlFor="expense-description">
              <input id="expense-description" className={inputClass} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <Field label={t("spentOn")} htmlFor="expense-date">
            <input id="expense-date" type="date" className={inputClass} value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} />
          </Field>
          <Field label={t("vendor")} htmlFor="expense-vendor">
            <select id="expense-vendor" className={inputClass} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">{t("noVendor")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.service ? `${vendor.name} (${vendor.service})` : vendor.name}
                </option>
              ))}
            </select>
          </Field>
          {options.separateFunds ? (
            <Field label={t("fund")} htmlFor="expense-fund">
              <select id="expense-fund" className={inputClass} value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {pick(fund.nameBn, fund.nameEn, locale)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {amount !== "" && !parsed.success ? <p className="text-[13px] text-bad">{t("badAmount")}</p> : null}
        <p className="text-[12.5px] text-muted-foreground">{expense ? t("editHint") : t("hint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !ready}>
            <Save aria-hidden />
            {busy ? t("saving") : expense ? t("saveChanges") : t("submit")}
          </Button>
          {expense && onDone ? (
            <Button type="button" variant="outline" onClick={onDone}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
        <FormStatus status={status} />
      </Card>
    </form>
  );
}
