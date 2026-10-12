"use client";

import { STAFF_KINDS, type StaffKind } from "@s57/shared";
import { useTranslations } from "next-intl";
import { TextField } from "@/components/cms/fields";
import { Field, inputClass } from "@/components/kit";

/** The job side of a stint, as typed; the API cleans and checks every field. */
export type JobValues = { designationBn: string; designationEn: string; kind: StaffKind; joinedOn: string; pay: string };

/** Designation, kind, joining day and, when `withPay`, the monthly salary or daily rate. */
export function JobFields({ id, values, onChange, withPay }: { id: string; values: JobValues; onChange: (values: JobValues) => void; withPay: boolean }) {
  const t = useTranslations("Staff");
  const set = <K extends keyof JobValues>(key: K, value: JobValues[K]) => onChange({ ...values, [key]: value });

  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <TextField
        id={`${id}-designation`}
        label={t("designationBn")}
        hint={t("designationHint")}
        value={values.designationBn}
        onChange={(e) => set("designationBn", e.target.value)}
        required
        maxLength={100}
      />
      <TextField
        id={`${id}-designation-en`}
        label={t("designationEn")}
        hint={t("optional")}
        value={values.designationEn}
        onChange={(e) => set("designationEn", e.target.value)}
        lang="en"
        maxLength={100}
      />
      <Field label={t("kindLabel")} htmlFor={`${id}-kind`}>
        <select id={`${id}-kind`} className={inputClass} value={values.kind} onChange={(e) => set("kind", e.target.value as StaffKind)}>
          {STAFF_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
      </Field>
      <TextField id={`${id}-joined`} label={t("joinedOn")} type="date" value={values.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} required />
      {withPay ? (
        <TextField
          id={`${id}-pay`}
          label={values.kind === "daily" ? t("dailyRate") : t("monthlySalary")}
          hint={t("payHint")}
          inputMode="decimal"
          value={values.pay}
          onChange={(e) => set("pay", e.target.value)}
        />
      ) : null}
    </div>
  );
}
