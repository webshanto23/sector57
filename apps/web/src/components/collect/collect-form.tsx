"use client";

import {
  addMoney,
  allocate,
  formatDate,
  formatTaka,
  localDigits,
  moneySchema,
  pick,
  subtractMoney,
  type CollectAccount,
  type DocumentHeader,
  type Locale,
} from "@s57/shared";
import { Printer, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { InvoiceStatusChip } from "@/components/billing/status-chip";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { Receipt, type ReceiptData } from "./receipt";

/**
 * The mockup's "Receive payment" form beside a live receipt. Find a unit or member; its open
 * bills are ticked, oldest first; the amount fills in and may be lowered (the oldest bills
 * are settled first). The API checks everything again inside one transaction.
 */
export function CollectForm({
  initial,
  startBillId,
  header,
  collector,
  today,
}: {
  initial: CollectAccount | null;
  /** From a bill page: only this bill starts ticked; the account's other open bills stay listed, unticked. */
  startBillId?: string;
  header: DocumentHeader;
  collector: string;
  /** `YYYY-MM-DD` in Dhaka, from the server. */
  today: string;
}) {
  const t = useTranslations("Collect");
  const tBilling = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CollectAccount[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [account, setAccount] = useState<CollectAccount | null>(initial);
  const startBill = initial?.bills.find((bill) => bill.id === startBillId) ?? null;
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(startBill ? [startBill.id] : initial?.bills.map((bill) => bill.id)));
  const [amount, setAmount] = useState(startBill?.due ?? initial?.due ?? "");
  const [touched, setTouched] = useState(false);
  const [payerId, setPayerId] = useState(initial?.payers[0]?.id ?? "");
  const [note, setNote] = useState("");

  function choose(next: CollectAccount | null) {
    setAccount(next);
    setTicked(new Set(next?.bills.map((bill) => bill.id)));
    setAmount(next && next.bills.length ? next.due : "");
    setTouched(false);
    setPayerId(next?.payers[0]?.id ?? "");
    setStatus(null);
  }

  async function find() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.GET("/collect/lookup", { params: { query: { q } } });
      setHits(data?.accounts ?? []);
    } finally {
      setSearching(false);
    }
  }

  const bills = account?.bills.filter((bill) => ticked.has(bill.id)) ?? [];
  const owed = addMoney("0", ...bills.map((bill) => bill.due));

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
    // An amount nobody typed follows the ticked bills.
    if (!touched && account) setAmount(addMoney("0", ...account.bills.filter((bill) => next.has(bill.id)).map((bill) => bill.due)));
  }

  const parsed = moneySchema.safeParse(amount);
  const result = parsed.success && bills.length ? allocate(bills, parsed.data) : null;
  const paidOn = new Map(result?.ok ? result.allocations.map((a) => [a.invoiceId, a.amount]) : []);
  const problem =
    bills.length === 0 ? t("tickOne") : result && !result.ok ? (result.code === "amount_exceeds_due" ? t("tooMuch") : t("notReached")) : null;
  const payer = account?.payers.find((p) => p.id === payerId) ?? null;

  const preview: ReceiptData | null =
    account && payer && result?.ok && parsed.success
      ? {
          kind: "bills",
          header,
          receiptNo: null,
          date: today,
          payer: { name: payer.name, nameEn: payer.nameEn, memberNo: account.memberNo },
          unit: account.kind === "unit" ? { name: account.name, address: account.address } : null,
          items: result.allocations.map((allocation) => {
            const bill = bills.find((b) => b.id === allocation.invoiceId)!;
            return {
              key: bill.id,
              label: bill.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", ") || tBilling(`kind.${bill.kind}`),
              invoiceNo: bill.invoiceNo,
              amount: allocation.amount,
              total: bill.due,
            };
          }),
          amount: parsed.data,
          collectedBy: collector,
          note: note.trim() || null,
          mark: null,
        }
      : null;

  async function save() {
    if (!account || !payer || !parsed.success || problem) return;
    const body = {
      ...(account.kind === "unit" ? { unitId: account.id } : { personId: account.id }),
      invoiceIds: bills.map((bill) => bill.id),
      amount: parsed.data,
      payer: { kind: payer.kind, id: payer.id },
      note: note.trim() || null,
    };
    const made = await run(() => api.POST("/payments", { body }));
    if (made) router.push(`/dashboard/collect/receipts/${made.id}?print=1`);
  }

  return (
    <div className="grid gap-3.5 min-[860px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] min-[860px]:items-start">
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card className="grid gap-3">
          <h2>{t("receive")}</h2>
          {account ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-surface-2 p-3">
              <div className="min-w-0">
                <p className="font-semibold">{account.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {account.kind === "unit" ? account.address.join(", ") : localDigits(t("memberNo", { no: account.memberNo ?? 0 }), locale)}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => choose(null)}>
                {t("change")}
              </Button>
            </div>
          ) : (
            <>
              <Field label={t("find")} htmlFor="collect-q">
                <div className="flex flex-wrap gap-2">
                  <input
                    id="collect-q"
                    type="search"
                    className={`${inputClass} min-w-0 flex-1`}
                    value={q}
                    placeholder={t("findPlaceholder")}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void find();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" disabled={searching} onClick={() => void find()}>
                    <Search aria-hidden />
                    {t("search")}
                  </Button>
                </div>
              </Field>
              {hits ? (
                hits.length === 0 ? (
                  <p className="text-[13.5px] text-muted-foreground">{t("noMatch")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {hits.map((hit) => (
                      <li key={`${hit.kind}-${hit.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{hit.name}</p>
                          <p className="text-[13px] text-muted-foreground">
                            {hit.kind === "unit" ? hit.address.join(", ") : `${t("membershipFees")} · ${localDigits(t("memberNo", { no: hit.memberNo ?? 0 }), locale)}`}
                          </p>
                          <p className="num text-[13px]">{hit.bills.length ? t("dueTotal", { amount: formatTaka(hit.due, locale) }) : t("nothingDue")}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" disabled={hit.bills.length === 0} onClick={() => choose(hit)}>
                          {t("choose")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          )}
        </Card>

        {account ? (
          account.bills.length === 0 ? (
            <Note>{t("nothingDue")}</Note>
          ) : (
            <>
              <Card className="grid gap-2">
                <h3 className="text-[13.5px] font-semibold text-muted-foreground">{t("bills")}</h3>
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
                            <span className="font-medium">
                              {bill.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", ") || tBilling(`kind.${bill.kind}`)}
                            </span>
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
                <p className="text-[12.5px] text-muted-foreground">{t("payAhead")}</p>
              </Card>

              <Card className="grid gap-3">
                <div className="grid gap-3 min-[600px]:grid-cols-2">
                  <Field label={t("amount")} htmlFor="collect-amount">
                    <input
                      id="collect-amount"
                      inputMode="decimal"
                      className={`${inputClass} num`}
                      value={amount}
                      aria-invalid={(amount !== "" && (!parsed.success || Boolean(problem))) || undefined}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setTouched(true);
                      }}
                    />
                  </Field>
                  <Field label={t("payer")} htmlFor="collect-payer">
                    <select id="collect-payer" className={inputClass} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                      {account.payers.map((option) => (
                        <option key={option.id} value={option.id}>
                          {pick(option.name, option.nameEn, locale)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("collectedBy")} htmlFor="collect-by">
                    <input id="collect-by" className={inputClass} value={collector} readOnly />
                  </Field>
                  <Field label={t("note")} htmlFor="collect-note">
                    <input id="collect-note" className={inputClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </div>
                <p className="text-[12.5px] text-muted-foreground">{t("amountHint")}</p>
                {problem ? <p className="text-[13px] text-bad">{problem}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={busy || Boolean(problem) || !parsed.success || !payer}>
                    <Printer aria-hidden />
                    {busy ? t("saving") : t("save")}
                  </Button>
                  <span className="num text-[13px] text-muted-foreground">{t("dueTotal", { amount: formatTaka(owed, locale) })}</span>
                </div>
                <FormStatus status={status} />
              </Card>
            </>
          )
        ) : null}
      </form>

      <section aria-label={t("receipt.preview")} className="grid gap-2">
        {preview ? (
          <Receipt data={preview} locale={locale} />
        ) : (
          <div className="rounded-[var(--radius)] border border-dashed border-line p-6 text-center text-[13.5px] text-muted-foreground">
            {t("receipt.previewEmpty")}
          </div>
        )}
      </section>
    </div>
  );
}
