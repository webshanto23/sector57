"use client";

import { addMoney, formatTaka, MAX_EXPENSE_LINES, moneySchema, pick, type ExpenseDetail, type ExpenseInputValues, type ExpenseOptions, type Locale } from "@s57/shared";
import { Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { PaymentMethodField, methodBody, type MethodValue } from "@/components/finance/payment-method-field";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { ExpenseLineCard, lineReady, type LineValue } from "./expense-line-card";

/** Keys for line cards; they only need to be unique on the page. */
let lineKeys = 0;
const newKey = () => String(lineKeys++);

/**
 * A new expense request, or changes to a pending one (`expense`): one card per line (head,
 * amount, description, vendor), and at the bottom one card for the whole record (title, date,
 * fund, payment method, total). Archived heads and vendors are offered only when the expense
 * already uses them. The fund picker shows only while the society keeps separate funds.
 * Vouchers are attached on the expense's page once saved.
 */
export function ExpenseForm({ options, expense, today, onDone }: { options: ExpenseOptions; expense?: ExpenseDetail; today: string; onDone?: () => void }) {
  const t = useTranslations("Expenses.form");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const usedHeads = new Set(expense?.lines.map((line) => line.head.id));
  const usedVendors = new Set(expense?.lines.flatMap((line) => (line.vendor ? [line.vendor.id] : [])));
  const heads = options.heads.filter((head) => !head.archived || usedHeads.has(head.id));
  const vendors = options.vendors.filter((vendor) => !vendor.archived || usedVendors.has(vendor.id));
  const defaultFund = options.funds.find((fund) => fund.isDefault) ?? options.funds[0];
  const funds = expense && !options.funds.some((fund) => fund.id === expense.fund.id) ? [{ ...expense.fund, isDefault: false }, ...options.funds] : options.funds;

  const blank = (): LineValue => ({ key: newKey(), headId: heads[0]?.id ?? "", vendorId: "", description: "", amount: "" });
  const [lines, setLines] = useState<LineValue[]>(() =>
    expense
      ? expense.lines.map((line) => ({ key: newKey(), headId: line.head.id, vendorId: line.vendor?.id ?? "", description: line.description, amount: line.amount }))
      : [blank()],
  );
  const [title, setTitle] = useState(expense?.title ?? "");
  const [fundId, setFundId] = useState(expense?.fund.id ?? defaultFund?.id ?? "");
  const [method, setMethod] = useState<MethodValue>({ method: expense?.method ?? "cash", methodRef: expense?.methodRef ?? "" });
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? today);
  const amounts = lines.map((line) => moneySchema.safeParse(line.amount)).flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  const total = addMoney("0", ...amounts);
  const ready = lines.every(lineReady) && spentOn !== "";

  const change = (key: string, next: LineValue) => setLines((current) => current.map((line) => (line.key === key ? next : line)));

  async function save() {
    if (!ready) return;
    const body: ExpenseInputValues = {
      title: title.trim() || null,
      fundId: options.separateFunds || (expense && expense.fund.id !== defaultFund?.id) ? fundId : null,
      ...methodBody(method),
      spentOn,
      lines: lines.map((line) => ({ headId: line.headId, vendorId: line.vendorId || null, description: line.description, amount: moneySchema.parse(line.amount) })),
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
      {lines.map((line, index) => (
        <ExpenseLineCard
          key={line.key}
          index={index}
          line={line}
          heads={heads}
          vendors={vendors}
          onChange={(next) => change(line.key, next)}
          onRemove={lines.length > 1 ? () => setLines((current) => current.filter((item) => item.key !== line.key)) : undefined}
        />
      ))}
      {lines.length < MAX_EXPENSE_LINES ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setLines((current) => [...current, blank()])}>
          <Plus aria-hidden />
          {t("addLine")}
        </Button>
      ) : null}

      <Card className="sticky bottom-3 z-10 grid gap-3 shadow-lg">
        <div className="grid gap-3 min-[600px]:grid-cols-2">
          <div className="min-[600px]:col-span-2">
            <Field label={t("recordTitle")} htmlFor="expense-title">
              <input id="expense-title" className={inputClass} value={title} maxLength={200} placeholder={t("recordTitleHint")} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <Field label={t("spentOn")} htmlFor="expense-date">
            <input id="expense-date" type="date" className={inputClass} value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} />
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
          <PaymentMethodField id="expense" value={method} onChange={setMethod} />
        </div>
        {method.method === "cheque" || method.method === "mobile" ? <p className="text-[12.5px] text-muted-foreground">{t("refLater")}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[14px]">
            {t("total", { count: lines.length })} <span className="num font-semibold">{formatTaka(total, locale)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {expense && onDone ? (
              <Button type="button" variant="outline" onClick={onDone}>
                {t("cancel")}
              </Button>
            ) : null}
            <Button type="submit" disabled={busy || !ready}>
              <Save aria-hidden />
              {busy ? t("saving") : expense ? t("saveChanges") : t("submit")}
            </Button>
          </div>
        </div>
        <p className="text-[12.5px] text-muted-foreground">{expense ? t("editHint") : t("hint")}</p>
        <FormStatus status={status} />
      </Card>
    </form>
  );
}
