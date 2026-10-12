"use client";

import { compareMoney, formatTaka, LEDGER_ACCOUNTS, type ExpenseDetail, type ExpenseOptions, type LedgerAccount, type Locale } from "@s57/shared";
import { Ban, Check, Pencil, Wallet, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ExpenseForm } from "./expense-form";

/** The next step for whoever may take it: edit, approve or reject, pay, void. The API checks each again. */
export function ExpenseActions({ expense, options, today }: { expense: ExpenseDetail; options: ExpenseOptions | null; today: string }) {
  const t = useTranslations("Expenses.actions");
  const [editing, setEditing] = useState(false);
  const { can } = expense;

  if (editing && options) return <ExpenseForm options={options} expense={expense} today={today} onDone={() => setEditing(false)} />;

  return (
    <div className="grid gap-3.5">
      {can.edit && options ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
          {t("edit")}
        </Button>
      ) : null}
      {can.approve || can.reject ? <Decide expense={expense} /> : null}
      {can.pay ? <Pay expense={expense} /> : null}
      {can.void ? <Void expense={expense} /> : null}
    </div>
  );
}

function Decide({ expense }: { expense: ExpenseDetail }) {
  const t = useTranslations("Expenses.actions");
  const { status, busy, run } = useSubmit();
  const [reason, setReason] = useState("");
  const path = { params: { path: { id: expense.id } } };
  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("decideTitle")}</h2>
      <p className="text-[13.5px] text-muted-foreground">{t("decideHint")}</p>
      {expense.budget?.over ? <Note tone="warn">{t("overBudget")}</Note> : null}
      <div>
        <Button type="button" disabled={busy} onClick={() => void run(() => api.POST("/expenses/{id}/approve", path), t("approvedNow"))}>
          <Check aria-hidden />
          {t("approve")}
        </Button>
      </div>
      <Field label={t("rejectReason")} htmlFor="expense-reject-reason">
        <input id="expense-reject-reason" className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || reason.trim() === ""}
          onClick={() => void run(() => api.POST("/expenses/{id}/reject", { ...path, body: { reason } }), t("rejectedNow"))}
        >
          <X aria-hidden />
          {t("reject")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function Pay({ expense }: { expense: ExpenseDetail }) {
  const t = useTranslations("Expenses.actions");
  const tAccount = useTranslations("Finance.funds");
  const locale = useLocale() as Locale;
  const { status, run } = useSubmit();
  const balance = expense.fundBalance ?? { cash: "0.00", bank: "0.00" };
  const [account, setAccount] = useState<LedgerAccount>(compareMoney(balance.cash, expense.amount) >= 0 || compareMoney(balance.bank, expense.amount) < 0 ? "cash" : "bank");
  const short = compareMoney(balance[account], expense.amount) < 0;

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("payTitle")}</h2>
      <Field label={t("account")} htmlFor="expense-pay-account">
        <select id="expense-pay-account" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value as LedgerAccount)}>
          {LEDGER_ACCOUNTS.map((option) => (
            <option key={option} value={option}>
              {t("accountOption", { account: tAccount(option), balance: formatTaka(balance[option], locale) })}
            </option>
          ))}
        </select>
      </Field>
      {short ? <Note tone="warn">{t("insufficient", { balance: formatTaka(balance[account], locale) })}</Note> : null}
      <div>
        <ConfirmButton
          label={t("pay", { amount: formatTaka(expense.amount, locale) })}
          question={t("payQuestion", { amount: formatTaka(expense.amount, locale) })}
          icon={Wallet}
          disabled={short}
          onConfirm={async () => {
            await run(() => api.POST("/expenses/{id}/pay", { params: { path: { id: expense.id } }, body: { account } }), t("paidNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function Void({ expense }: { expense: ExpenseDetail }) {
  const t = useTranslations("Expenses.actions");
  const { status, run } = useSubmit();
  const [reason, setReason] = useState("");
  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("voidTitle")}</h2>
      <p className="text-[13.5px] text-muted-foreground">{expense.status === "paid" ? t("voidHintPaid") : t("voidHint")}</p>
      <Field label={t("voidReason")} htmlFor="expense-void-reason">
        <input id="expense-void-reason" className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div>
        <ConfirmButton
          label={t("void")}
          question={t("voidQuestion")}
          icon={Ban}
          destructive
          disabled={reason.trim() === ""}
          onConfirm={async () => {
            await run(() => api.POST("/expenses/{id}/void", { params: { path: { id: expense.id } }, body: { reason } }), t("voidedNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
