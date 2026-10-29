"use client";

import { moneySchema, pick, type DonationCreateInput, type DonationOptions, type DonorOption, type Locale } from "@s57/shared";
import { Printer, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { donationLine, Receipt, type ReceiptData } from "@/components/collect/receipt";
import { CASH, methodBody, methodReady, PaymentMethodField, type MethodValue } from "@/components/finance/payment-method-field";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

type Mode = "onRecord" | "new" | "anonymous";
const MODES: Mode[] = ["onRecord", "new", "anonymous"];

/**
 * Records a donation beside its live receipt. The donor is someone on record (searched by
 * name or phone), a new person, or anonymous. The fund picker shows only while the society
 * keeps separate funds. Saving opens the receipt and prints it once.
 */
export function DonationForm({
  options,
  initialDonor,
  collector,
  today,
}: {
  options: DonationOptions;
  initialDonor: DonorOption | null;
  collector: string;
  /** `YYYY-MM-DD` in Dhaka, from the server. */
  today: string;
}) {
  const t = useTranslations("Donations.form");
  const tReceipt = useTranslations("Collect.receipt");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();

  const [mode, setMode] = useState<Mode>("onRecord");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DonorOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [donor, setDonor] = useState<DonorOption | null>(initialDonor);
  const [fresh, setFresh] = useState({ fullName: "", fullNameEn: "", phone: "" });
  const defaultFund = options.funds.find((fund) => fund.isDefault) ?? options.funds[0];
  const [fundId, setFundId] = useState(defaultFund?.id ?? "");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paidBy, setPaidBy] = useState<MethodValue>(CASH);

  async function find() {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const { data } = await api.GET("/donations/donors", { params: { query: { q } } });
      setHits(data?.donors ?? []);
    } finally {
      setSearching(false);
    }
  }

  const parsed = moneySchema.safeParse(amount);
  const fund = options.funds.find((option) => option.id === fundId) ?? defaultFund;
  const donorInput: DonationCreateInput["donor"] | null =
    mode === "anonymous"
      ? { kind: "anonymous" }
      : mode === "new"
        ? fresh.fullName.trim()
          ? { kind: "new", fullName: fresh.fullName, fullNameEn: fresh.fullNameEn || null, phone: fresh.phone || null }
          : null
        : donor
          ? { kind: donor.kind, id: donor.id }
          : null;
  const shownDonor =
    mode === "anonymous"
      ? null
      : mode === "new"
        ? { name: fresh.fullName.trim(), nameEn: fresh.fullNameEn.trim() || null, membershipCode: null }
        : donor
          ? { name: donor.name, nameEn: donor.nameEn, membershipCode: null }
          : null;
  const problem = !donorInput ? t("needDonor") : amount !== "" && !parsed.success ? t("badAmount") : null;
  const purposeText = purpose.trim() || null;

  const preview: ReceiptData | null =
    donorInput && parsed.success && fund
      ? {
          kind: "donation",
          header: options.header,
          receiptNo: null,
          date: today,
          payer: shownDonor,
          unit: null,
          items: [
            {
              key: "donation",
              label: donationLine(tReceipt, purposeText),
              invoiceNo: null,
              detail: pick(fund.nameBn, fund.nameEn, locale),
              amount: parsed.data,
              total: parsed.data,
            },
          ],
          amount: parsed.data,
          ...methodBody(paidBy),
          collectedBy: collector,
          note: note.trim() || null,
          mark: null,
        }
      : null;

  async function save() {
    if (!donorInput || !parsed.success || !methodReady(paidBy)) return;
    const body = {
      donor: donorInput,
      fundId: options.separateFunds ? fundId : null,
      purpose: purposeText,
      amount: parsed.data,
      ...methodBody(paidBy),
      note: note.trim() || null,
    } satisfies DonationCreateInput;
    const made = await run(() => api.POST("/donations", { body }));
    if (made) router.push(`/dashboard/donations/${made.id}?print=1`);
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
          <h2>{t("donor")}</h2>
          <div role="radiogroup" aria-label={t("donor")} className="flex flex-wrap gap-2">
            {MODES.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13.5px] has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input type="radio" name="donor-mode" className="accent-[var(--accent-brand)]" checked={mode === option} onChange={() => setMode(option)} />
                {t(`kind.${option}`)}
              </label>
            ))}
          </div>

          {mode === "onRecord" ? (
            donor ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-surface-2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{pick(donor.name, donor.nameEn, locale)}</p>
                  <p className="num text-[13px] text-muted-foreground">{[donor.kind === "organisation" ? t("organisation") : null, donor.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setDonor(null)}>
                  {t("change")}
                </Button>
              </div>
            ) : (
              <>
                <Field label={t("find")} htmlFor="donor-q">
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="donor-q"
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
                    <Button type="button" variant="outline" disabled={searching || q.trim().length < 2} onClick={() => void find()}>
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
                            <p className="font-semibold">{pick(hit.name, hit.nameEn, locale)}</p>
                            <p className="num text-[13px] text-muted-foreground">
                              {[hit.kind === "organisation" ? t("organisation") : null, hit.phone].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => setDonor(hit)}>
                            {t("choose")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </>
            )
          ) : mode === "new" ? (
            <div className="grid gap-3 min-[600px]:grid-cols-2">
              <Field label={t("fullName")} htmlFor="donor-name">
                <input
                  id="donor-name"
                  className={inputClass}
                  value={fresh.fullName}
                  maxLength={200}
                  onChange={(e) => setFresh({ ...fresh, fullName: e.target.value })}
                />
              </Field>
              <Field label={t("phone")} htmlFor="donor-phone">
                <input
                  id="donor-phone"
                  inputMode="tel"
                  className={`${inputClass} num`}
                  value={fresh.phone}
                  onChange={(e) => setFresh({ ...fresh, phone: e.target.value })}
                />
              </Field>
              <Field label={t("fullNameEn")} htmlFor="donor-name-en">
                <input
                  id="donor-name-en"
                  className={inputClass}
                  value={fresh.fullNameEn}
                  maxLength={200}
                  onChange={(e) => setFresh({ ...fresh, fullNameEn: e.target.value })}
                />
              </Field>
              <p className="self-end text-[12.5px] text-muted-foreground">{t("newHint")}</p>
            </div>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{t("anonymousHint")}</p>
          )}
        </Card>

        <Card className="grid gap-3">
          <div className="grid gap-3 min-[600px]:grid-cols-2">
            <Field label={t("amount")} htmlFor="donation-amount">
              <input
                id="donation-amount"
                inputMode="decimal"
                className={`${inputClass} num`}
                value={amount}
                aria-invalid={(amount !== "" && !parsed.success) || undefined}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            {options.separateFunds ? (
              <Field label={t("fund")} htmlFor="donation-fund">
                <select id="donation-fund" className={inputClass} value={fundId} onChange={(e) => setFundId(e.target.value)}>
                  {options.funds.map((option) => (
                    <option key={option.id} value={option.id}>
                      {pick(option.nameBn, option.nameEn, locale)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label={t("purpose")} htmlFor="donation-purpose">
              <input
                id="donation-purpose"
                className={inputClass}
                list="donation-purposes"
                value={purpose}
                maxLength={200}
                onChange={(e) => setPurpose(e.target.value)}
              />
              <datalist id="donation-purposes">
                {options.purposes.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label={t("note")} htmlFor="donation-note">
              <input id="donation-note" className={inputClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <PaymentMethodField id="donation" value={paidBy} onChange={setPaidBy} />
            <Field label={t("receivedBy")} htmlFor="donation-by">
              <input id="donation-by" className={inputClass} value={collector} readOnly />
            </Field>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{t("purposeHint")}</p>
          {problem && amount !== "" ? <p className="text-[13px] text-bad">{problem}</p> : null}
          <div>
            <Button type="submit" disabled={busy || !donorInput || !parsed.success || !methodReady(paidBy)}>
              <Printer aria-hidden />
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
          <FormStatus status={status} />
        </Card>
      </form>

      <section aria-label={tReceipt("preview")} className="grid gap-2">
        {preview ? (
          <Receipt data={preview} locale={locale} />
        ) : (
          <div className="rounded-[var(--radius)] border border-dashed border-line p-6 text-center text-[13.5px] text-muted-foreground">
            {t("previewEmpty")}
          </div>
        )}
      </section>
    </div>
  );
}
