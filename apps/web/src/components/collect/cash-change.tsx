"use client";

import { compareMoney, formatTaka, moneySchema, subtractMoney, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Field, inputClass } from "@/components/kit";

/** A cash helper for the desk: what the payer handed over and the change to give back. Nothing here is saved. */
export function CashChange({ amount }: { amount: string | null }) {
  const t = useTranslations("Collect");
  const locale = useLocale() as Locale;
  const [given, setGiven] = useState("");
  const parsed = moneySchema.safeParse(given);
  const back = amount && parsed.success && compareMoney(parsed.data, amount) >= 0 ? subtractMoney(parsed.data, amount) : null;

  return (
    <>
      <Field label={t("tendered")} htmlFor="collect-given">
        <input id="collect-given" inputMode="decimal" className={`${inputClass} num`} value={given} onChange={(e) => setGiven(e.target.value)} />
      </Field>
      {back ? (
        <p aria-live="polite" className="flex min-h-10 items-center justify-between gap-3 self-end rounded-[8px] bg-good-soft px-3 py-2 font-semibold text-good">
          <span>{t("changeDue")}</span>
          <span className="num">{formatTaka(back, locale)}</span>
        </p>
      ) : null}
    </>
  );
}
