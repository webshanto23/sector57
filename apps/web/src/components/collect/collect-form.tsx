"use client";

import {
  addMoney,
  allocate,
  formatNumber,
  formatTaka,
  moneySchema,
  pick,
  type CollectAccount,
  type CollectAreas,
  type DocumentHeader,
  type Locale,
} from "@s57/shared";
import { Plus, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CASH, methodBody, methodReady, PaymentMethodField, refLabelKey, type MethodValue } from "@/components/finance/payment-method-field";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { CashChange } from "./cash-change";
import { CollectBills } from "./collect-bills";
import { CollectPicker } from "./collect-picker";
import { Receipt, type ReceiptData } from "./receipt";

/** Where the form and receipt sit side by side (matches `min-[860px]` below). */
const WIDE = "(min-width: 860px)";

/**
 * The mockup's "Receive payment" form beside a live receipt. Find a unit or member; its open
 * bills are ticked, oldest first; the amount fills in and may be lowered (the oldest bills
 * are settled first). The API checks everything again inside one transaction. On a phone the
 * total and Save stay on screen, and the receipt opens as a sheet.
 */
export function CollectForm({
  initial,
  openAccounts,
  areas,
  startBillIds,
  header,
  collector,
  today,
  summary,
  summaryLine,
  after,
}: {
  initial: CollectAccount | null;
  /** Before any search: the accounts whose open bills are newest. */
  openAccounts: CollectAccount[];
  /** The top places of the area filter. */
  areas: CollectAreas["children"];
  /** From a bill page or the bills list: only these bills start ticked; the account's other open bills stay listed, unticked. */
  startBillIds?: string[];
  header: DocumentHeader;
  collector: string;
  /** `YYYY-MM-DD` in Dhaka, from the server. */
  today: string;
  /** The day's figures and handover, above the search. */
  summary: ReactNode;
  /** The same figures in one line, while a payment is being taken. */
  summaryLine: ReactNode;
  /** Shown below the search, hidden while a payment is being taken. */
  after: ReactNode;
}) {
  const t = useTranslations("Collect");
  const tBilling = useTranslations("Billing");
  const tMethod = useTranslations("Finance.method");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();
  const amountBox = useRef<HTMLInputElement>(null);
  const receiptSheet = useRef<HTMLDialogElement>(null);

  const [account, setAccount] = useState<CollectAccount | null>(initial);
  const startBills = initial?.bills.filter((bill) => startBillIds?.includes(bill.id)) ?? [];
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(startBills.length ? startBills.map((bill) => bill.id) : initial?.bills.map((bill) => bill.id)),
  );
  const [amount, setAmount] = useState(startBills.length ? addMoney("0", ...startBills.map((bill) => bill.due)) : (initial?.due ?? ""));
  const [touched, setTouched] = useState(false);
  const [payerId, setPayerId] = useState(initial?.payers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [paidBy, setPaidBy] = useState<MethodValue>(CASH);

  function choose(next: CollectAccount | null) {
    setAccount(next);
    setTicked(new Set(next?.bills.map((bill) => bill.id)));
    setAmount(next && next.bills.length ? next.due : "");
    setTouched(false);
    setPayerId(next?.payers[0]?.id ?? "");
    setNote("");
    setNoteOpen(false);
    setPaidBy(CASH);
    setStatus(null);
    // On a phone the keyboard would cover the bills, so only wide screens jump to the amount.
    if (next && window.matchMedia(WIDE).matches) requestAnimationFrame(() => amountBox.current?.select());
  }

  function change() {
    choose(null);
    // Opened on one account, the page has no open list yet: load it.
    if (initial) router.replace("/dashboard/collect");
  }

  const bills = account?.bills.filter((bill) => ticked.has(bill.id)) ?? [];
  const owed = addMoney("0", ...bills.map((bill) => bill.due));

  function tick(next: Set<string>) {
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
  // The one thing stopping Save, so the button is never grey without a reason.
  const blocked =
    problem ?? (!parsed.success ? t("enterAmount") : !payer ? t("noPayer") : !methodReady(paidBy) ? t("needRef", { field: tMethod(refLabelKey(paidBy.method)) }) : null);

  const preview: ReceiptData | null =
    account && payer && result?.ok && parsed.success
      ? {
          kind: "bills",
          header,
          receiptNo: null,
          date: today,
          payer: { name: payer.name, nameEn: payer.nameEn, membershipCode: account.membershipCode },
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
          ...methodBody(paidBy),
          collectedBy: collector,
          note: note.trim() || null,
          mark: null,
        }
      : null;

  async function save() {
    if (!account || !payer || !parsed.success || blocked) return;
    const body = {
      ...(account.kind === "unit" ? { unitId: account.id } : account.memberKind === "organisation" ? { organisationId: account.id } : { personId: account.id }),
      invoiceIds: bills.map((bill) => bill.id),
      amount: parsed.data,
      payer: { kind: payer.kind, id: payer.id },
      ...methodBody(paidBy),
      note: note.trim() || null,
    };
    const made = await run(() => api.POST("/payments", { body }));
    if (made) router.push(`/dashboard/collect/receipts/${made.id}?print=1`);
  }

  if (!account) {
    return (
      <>
        {/* Keyed: elements sent from the server can miss React's static-children check. */}
        <Fragment key="summary">{summary}</Fragment>
        <CollectPicker openAccounts={openAccounts} areas={areas} onChoose={choose} />
        <Fragment key="after">{after}</Fragment>
      </>
    );
  }

  return (
    <>
      <Fragment key="summary">{summaryLine}</Fragment>
      <div className="grid gap-3.5 min-[860px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] min-[860px]:items-start">
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Card flat className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{account.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {account.kind === "unit" ? account.address.join(", ") : account.membershipCode ? t("memberNo", { no: account.membershipCode }) : tBilling("idPending")}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={change}>
              {t("change")}
            </Button>
          </Card>

          {account.bills.length === 0 ? (
            <Note>{t("nothingDue")}</Note>
          ) : (
            <>
              <CollectBills account={account} ticked={ticked} paidOn={paidOn} onChange={tick} />

              <Card className="grid gap-3">
                <Field label={t("amount")} htmlFor="collect-amount">
                  <div className="flex gap-2">
                    <input
                      ref={amountBox}
                      id="collect-amount"
                      inputMode="decimal"
                      className={`${inputClass} num min-w-0 flex-1 text-lg font-bold`}
                      value={amount}
                      aria-invalid={(amount !== "" && (!parsed.success || Boolean(problem))) || undefined}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setTouched(true);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto"
                      disabled={bills.length === 0}
                      onClick={() => {
                        setAmount(owed);
                        setTouched(false);
                      }}
                    >
                      {t("fullDue")}
                    </Button>
                  </div>
                </Field>
                <p className="text-[12.5px] text-muted-foreground">{t("amountHint")}</p>
                <div className="grid gap-3 min-[600px]:grid-cols-2">
                  <Field label={t("payer")} htmlFor="collect-payer">
                    <select id="collect-payer" className={inputClass} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                      {account.payers.map((option) => (
                        <option key={option.id} value={option.id}>
                          {pick(option.name, option.nameEn, locale)}
                          {option.phone ? ` · ${option.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <PaymentMethodField id="collect" value={paidBy} onChange={setPaidBy} />
                  {paidBy.method === "cash" ? <CashChange key={account.id} amount={parsed.success ? parsed.data : null} /> : null}
                </div>
                {noteOpen ? (
                  <Field label={t("note")} htmlFor="collect-note">
                    <input id="collect-note" autoFocus className={inputClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  {noteOpen ? (
                    <span />
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => setNoteOpen(true)}>
                      <Plus aria-hidden className="size-3.5" />
                      {t("addNote")}
                    </button>
                  )}
                  <span className="text-muted-foreground">{t("collectedByName", { name: collector })}</span>
                </div>
              </Card>

              {/* Stays on screen on a phone: the form is long and the total must not scroll away. */}
              <div className="sticky bottom-0 z-10 grid gap-2 rounded-[12px] border border-line bg-surface p-3 min-[860px]:static min-[860px]:p-4">
                <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
                  <span className="flex flex-wrap items-center gap-x-2">
                    {t("billsCount", { count: formatNumber(bills.length, locale) })}
                    {preview ? (
                      <button type="button" className="font-semibold text-primary min-[860px]:hidden" onClick={() => receiptSheet.current?.showModal()}>
                        {t("viewReceipt")}
                      </button>
                    ) : null}
                  </span>
                  <b className="num text-lg text-fg">{parsed.success ? formatTaka(parsed.data, locale) : "—"}</b>
                </div>
                {blocked ? (
                  <p aria-live="polite" className="text-[13px] text-bad">
                    {blocked}
                  </p>
                ) : null}
                <Button type="submit" className="h-12 w-full text-[15px]" disabled={busy || Boolean(blocked)}>
                  <Printer aria-hidden />
                  {busy ? t("saving") : t("save")}
                </Button>
                <FormStatus status={status} />
              </div>
            </>
          )}
        </form>

        <section aria-label={t("receipt.preview")} className="hidden gap-2 min-[860px]:grid">
          {preview ? (
            <Receipt data={preview} locale={locale} />
          ) : (
            <div className="rounded-[var(--radius)] border border-dashed border-line p-6 text-center text-[13.5px] text-muted-foreground">
              {t("receipt.previewEmpty")}
            </div>
          )}
        </section>
      </div>

      <dialog
        ref={receiptSheet}
        aria-label={t("receipt.preview")}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-surface p-4 text-fg backdrop:bg-fg/50"
      >
        <div className="grid gap-3">
          {preview ? <Receipt data={preview} locale={locale} /> : null}
          <Button type="button" variant="outline" className="h-12 w-full" onClick={() => receiptSheet.current?.close()}>
            {t("closeReceipt")}
          </Button>
        </div>
      </dialog>
    </>
  );
}
