"use client";

import { accountOfMethod, methodNeedsRef, PAYMENT_METHODS, PAYMENT_REF_MAX, type PaymentMethod } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Field, inputClass } from "@/components/kit";

/** How money was paid, as a form holds it: the reference stays typed while the method changes. */
export type MethodValue = { method: PaymentMethod; methodRef: string };

export const CASH: MethodValue = { method: "cash", methodRef: "" };

/** False while a cheque or wallet payment has no reference. */
export const methodReady = (value: MethodValue): boolean => !methodNeedsRef(value.method) || value.methodRef.trim() !== "";

/** What the API takes: a cash payment sends no reference. */
export const methodBody = (value: MethodValue) => ({
  method: value.method,
  methodRef: value.method === "cash" ? null : value.methodRef.trim() || null,
});

/**
 * The method picker with its reference box (cheque number, or wallet and transaction ID).
 * Under it, which account the money goes to or leaves: cash or the bank.
 */
export function PaymentMethodField({ id, value, onChange }: { id: string; value: MethodValue; onChange: (next: MethodValue) => void }) {
  const t = useTranslations("Finance.method");
  const tAccount = useTranslations("Finance.funds");
  const refLabel = value.method === "cheque" ? t("refCheque") : value.method === "mobile" ? t("refMobile") : t("refBank");
  const missing = !methodReady(value);

  return (
    <>
      <Field label={t("label")} htmlFor={`${id}-method`}>
        <select id={`${id}-method`} className={inputClass} value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as PaymentMethod })}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {t(method)}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted-foreground">{t("toAccount", { account: tAccount(accountOfMethod(value.method)) })}</span>
      </Field>
      {value.method === "cash" ? null : (
        <Field label={refLabel} htmlFor={`${id}-ref`}>
          <input
            id={`${id}-ref`}
            className={inputClass}
            value={value.methodRef}
            maxLength={PAYMENT_REF_MAX}
            placeholder={value.method === "mobile" ? t("refMobileHint") : undefined}
            aria-invalid={missing || undefined}
            aria-required={methodNeedsRef(value.method) || undefined}
            onChange={(e) => onChange({ ...value, methodRef: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}
