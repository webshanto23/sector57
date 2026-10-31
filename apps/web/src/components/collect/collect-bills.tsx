"use client";

import { addMoney, formatDate, formatNumber, formatTaka, pick, subtractMoney, type CollectAccount, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { InvoiceStatusChip } from "@/components/billing/status-chip";
import { Card } from "@/components/kit";

/** The account's open bills to tick, with "all" and "none" and what the ticks add up to. */
export function CollectBills({
  account,
  ticked,
  paidOn,
  onChange,
}: {
  account: CollectAccount;
  ticked: Set<string>;
  /** Bill id to what this payment settles on it. */
  paidOn: Map<string, string>;
  onChange: (next: Set<string>) => void;
}) {
  const t = useTranslations("Collect");
  const tBilling = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const chosen = account.bills.filter((bill) => ticked.has(bill.id));

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <Card className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-muted-foreground">{t("bills")}</h3>
        <div className="flex gap-3 text-[13.5px] font-semibold text-primary">
          <button type="button" onClick={() => onChange(new Set(account.bills.map((bill) => bill.id)))}>
            {t("selectAll")}
          </button>
          <button type="button" onClick={() => onChange(new Set())}>
            {t("clearAll")}
          </button>
        </div>
      </div>
      <ul className="grid gap-2">
        {account.bills.map((bill) => {
          const on = ticked.has(bill.id);
          const pays = paidOn.get(bill.id);
          const left = on && pays ? subtractMoney(bill.due, pays) : null;
          return (
            <li key={bill.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-line p-2.5 has-[:checked]:border-primary">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--accent-brand)]" checked={on} onChange={() => toggle(bill.id)} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{bill.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", ") || tBilling(`kind.${bill.kind}`)}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span className="font-mono">{bill.invoiceNo}</span>
                    <span>
                      {tBilling("detail.dueDate")}: {formatDate(bill.dueDate, locale, "short")}
                    </span>
                    <InvoiceStatusChip row={bill} />
                  </span>
                  {left && left !== "0.00" ? <span className="num text-[12.5px] text-warn">{t("leftAfter", { amount: formatTaka(left, locale) })}</span> : null}
                </span>
                <b className="num whitespace-nowrap">{formatTaka(bill.due, locale)}</b>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="num text-[13px] text-muted-foreground">
        <b className="text-fg">
          {t("billsChosen", {
            ticked: formatNumber(chosen.length, locale),
            total: formatNumber(account.bills.length, locale),
            amount: formatTaka(addMoney("0", ...chosen.map((bill) => bill.due)), locale),
          })}
        </b>
        {" · "}
        {t("dueTotal", { amount: formatTaka(account.due, locale) })}
      </p>
      <p className="text-[12.5px] text-muted-foreground">{t("payAhead")}</p>
    </Card>
  );
}
