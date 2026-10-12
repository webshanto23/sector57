"use client";

import { compareMoney, formatTaka, LEDGER_ACCOUNTS, moneySchema, pick, type Fund, type LedgerAccount, type Locale } from "@s57/shared";
import { ArrowRightLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

type Preset = "deposit" | "withdrawal" | "between";

/**
 * Moves money: a bank deposit (one fund, cash to bank), a withdrawal (bank to cash), or from
 * one fund to another. Shows what the source holds and won't send more; the API checks again
 * under its lock.
 */
export function TransferForm({ funds }: { funds: Fund[] }) {
  const t = useTranslations("Ledger.form");
  const tFunds = useTranslations("Finance.funds");
  const tErrors = useTranslations("Admin.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, run } = useSubmit();
  const open = funds.filter((fund) => !fund.closedAt);
  const first = open.find((fund) => fund.isDefault) ?? open[0];

  const [preset, setPreset] = useState<Preset>("deposit");
  const [fromFundId, setFromFundId] = useState(first?.id ?? "");
  const [toFundId, setToFundId] = useState(open.find((fund) => fund.id !== first?.id)?.id ?? first?.id ?? "");
  const [fromAccount, setFromAccount] = useState<LedgerAccount>("cash");
  const [toAccount, setToAccount] = useState<LedgerAccount>("cash");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  if (!first) return null;
  const fundOf = (id: string) => open.find((fund) => fund.id === id) ?? first;
  // A deposit or withdrawal stays in one fund; its accounts follow from the choice.
  const source = { fundId: fromFundId, account: preset === "deposit" ? "cash" : preset === "withdrawal" ? "bank" : fromAccount } as const;
  const target =
    preset === "between" ? { fundId: toFundId, account: toAccount } : { fundId: fromFundId, account: preset === "deposit" ? ("bank" as const) : ("cash" as const) };
  const balance = fundOf(source.fundId).balance[source.account];
  const parsed = moneySchema.safeParse(amount);
  const short = parsed.success && compareMoney(balance, parsed.data) < 0;
  const same = source.fundId === target.fundId && source.account === target.account;
  const ready = parsed.success && !short && !same;
  const presets: Preset[] = open.length > 1 ? ["deposit", "withdrawal", "between"] : ["deposit", "withdrawal"];

  const fundSelect = (id: string, value: string, onChange: (value: string) => void, label: string) => (
    <Field label={label} htmlFor={id}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {open.map((fund) => (
          <option key={fund.id} value={fund.id}>
            {pick(fund.nameBn, fund.nameEn, locale)}
          </option>
        ))}
      </select>
    </Field>
  );
  const accountSelect = (id: string, fundId: string, value: LedgerAccount, onChange: (value: LedgerAccount) => void, label: string) => (
    <Field label={label} htmlFor={id}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as LedgerAccount)}>
        {LEDGER_ACCOUNTS.map((account) => (
          <option key={account} value={account}>
            {t("holds", { account: tFunds(account), balance: formatTaka(fundOf(fundId).balance[account], locale) })}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Card className="grid max-w-[640px] gap-3.5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-semibold">{t("preset")}</legend>
        <div className="flex flex-wrap gap-2">
          {presets.map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-[8px] border border-line px-3 py-2 text-[13.5px] has-checked:border-primary has-checked:bg-accent">
              <input type="radio" name="preset" value={option} checked={preset === option} onChange={() => setPreset(option)} className="accent-[var(--accent-brand)]" />
              {t(option)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 min-[600px]:grid-cols-2">
        {open.length > 1 ? fundSelect("transfer-from-fund", fromFundId, setFromFundId, t("fromFund")) : null}
        {preset === "between" ? (
          accountSelect("transfer-from-account", fromFundId, fromAccount, setFromAccount, t("fromAccount"))
        ) : (
          <p className="self-end pb-2 text-[13.5px] text-muted-foreground">
            {t("holds", { account: tFunds(source.account), balance: formatTaka(balance, locale) })}
          </p>
        )}
      </div>
      {preset === "between" ? (
        <div className="grid gap-3 min-[600px]:grid-cols-2">
          {fundSelect("transfer-to-fund", toFundId, setToFundId, t("toFund"))}
          {accountSelect("transfer-to-account", toFundId, toAccount, setToAccount, t("toAccount"))}
        </div>
      ) : null}
      {same ? <Note tone="warn">{tErrors("transfer_nothing_moves")}</Note> : null}

      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("amount")} htmlFor="transfer-amount">
          <input id="transfer-amount" inputMode="decimal" className={inputClass} value={amount} aria-invalid={amount !== "" && !parsed.success} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("memo")} htmlFor="transfer-memo">
          <input id="transfer-memo" className={inputClass} value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
      {amount !== "" && !parsed.success ? <Note tone="warn">{tErrors("invalid_amount")}</Note> : null}
      {short ? <Note tone="warn">{t("short", { balance: formatTaka(balance, locale) })}</Note> : null}

      <div className="flex flex-wrap items-start gap-2.5">
        <ConfirmButton
          label={parsed.success ? t("submit", { amount: formatTaka(parsed.data, locale) }) : t("submitPlain")}
          question={t("question", { amount: parsed.success ? formatTaka(parsed.data, locale) : "" })}
          icon={ArrowRightLeft}
          disabled={!ready}
          onConfirm={async () => {
            if (!parsed.success) return;
            const body = { fromFundId: source.fundId, fromAccount: source.account, toFundId: target.fundId, toAccount: target.account, amount: parsed.data, memo };
            const saved = await run(() => api.POST("/ledger/transfers", { body }), t("saved"));
            if (saved) router.push(`/dashboard/ledger/transfers/${saved.id}`);
          }}
        />
        <Link href="/dashboard/ledger/transfers" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
