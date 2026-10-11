"use client";

import { moneySchema, pick, type ChargeTypeList, type Locale } from "@s57/shared";
import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** A unit's dues from before the system, entered once as one bill kept apart in reports. */
export function OpeningForm({ unitId, chargeTypes, today }: { unitId: string; chargeTypes: ChargeTypeList; today: string }) {
  const t = useTranslations("Billing.opening");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  // Regular charges first: earlier arrears are usually unpaid service charges.
  const types = chargeTypes.items.filter((type) => !type.archived).sort((a, b) => Number(b.kind === "due") - Number(a.kind === "due"));
  const [open, setOpen] = useState(false);
  const [asOf, setAsOf] = useState(today);
  const [chargeTypeId, setChargeTypeId] = useState(types[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const amountOk = moneySchema.safeParse(amount).success;

  if (types.length === 0) return null;
  if (!open) {
    return (
      <Button type="button" variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
        <History aria-hidden />
        {t("add")}
      </Button>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-3 rounded-[8px] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.POST("/invoices/opening", { body: { unitId, asOf, chargeTypeId, amount, note } }), t("saved"));
      }}
    >
      <h3 className="text-[14px]">{t("title")}</h3>
      <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("asOf")} htmlFor="opening-as-of">
          <input id="opening-as-of" type="date" className={inputClass} value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        <Field label={t("amount")} htmlFor="opening-amount">
          <input
            id="opening-amount"
            inputMode="decimal"
            className={`${inputClass} num`}
            value={amount}
            aria-invalid={(amount !== "" && !amountOk) || undefined}
            aria-describedby={amount !== "" && !amountOk ? "opening-amount-error" : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          {amount !== "" && !amountOk ? (
            <span id="opening-amount-error" className="text-[12.5px] text-bad">
              {tAll("Admin.errors.invalid_amount")}
            </span>
          ) : null}
        </Field>
        <Field label={t("chargeType")} htmlFor="opening-type">
          <select id="opening-type" className={inputClass} value={chargeTypeId} onChange={(e) => setChargeTypeId(e.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {pick(type.nameBn, type.nameEn, locale)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("note")} htmlFor="opening-note">
          <input id="opening-note" className={inputClass} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={busy || !amountOk}>
          {t("save")}
        </Button>
      </div>
      <FormStatus status={status} />
    </form>
  );
}
