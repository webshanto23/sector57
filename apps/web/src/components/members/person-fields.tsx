"use client";

import { GENDERS, type Gender } from "@s57/shared";
import { useTranslations } from "next-intl";
import { TextField } from "@/components/cms/fields";
import { Field, inputClass } from "@/components/kit";

/** A person as typed on a form; the API cleans and checks every field. */
export type PersonValues = {
  fullName: string;
  fullNameEn: string;
  phone: string;
  email: string;
  nid: string;
  dateOfBirth: string;
  gender: Gender | "";
};

export const emptyPerson: PersonValues = { fullName: "", fullNameEn: "", phone: "", email: "", nid: "", dateOfBirth: "", gender: "" };

/** The request body for a person (blank fields become null on the API). */
export const personBody = (values: PersonValues) => ({ ...values, gender: values.gender || null });

/**
 * Name, English name, phone, NID and, unless `short`, email, date of birth and gender.
 * `nidHidden` replaces the NID box with a note (the caller may not see the number).
 */
export function PersonFields({
  id,
  values,
  onChange,
  short = false,
  nidHidden = false,
}: {
  id: string;
  values: PersonValues;
  onChange: (values: PersonValues) => void;
  short?: boolean;
  nidHidden?: boolean;
}) {
  const t = useTranslations("Members");
  const set = <K extends keyof PersonValues>(key: K, value: PersonValues[K]) => onChange({ ...values, [key]: value });

  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <TextField
        id={`${id}-name`}
        label={t("fullName")}
        hint={short ? undefined : t("fullNameHint")}
        value={values.fullName}
        onChange={(e) => set("fullName", e.target.value)}
        required
        autoComplete="off"
      />
      <TextField
        id={`${id}-name-en`}
        label={t("fullNameEn")}
        hint={short ? undefined : t("optional")}
        value={values.fullNameEn}
        onChange={(e) => set("fullNameEn", e.target.value)}
        lang="en"
        autoComplete="off"
      />
      <TextField
        id={`${id}-phone`}
        label={t("phone")}
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={(e) => set("phone", e.target.value)}
        autoComplete="off"
      />
      {nidHidden ? (
        <p className="self-end text-[12.5px] text-muted-foreground">{t("nidHidden")}</p>
      ) : (
        <TextField
          id={`${id}-nid`}
          label={t("nid")}
          hint={t("nidHint")}
          inputMode="numeric"
          value={values.nid}
          onChange={(e) => set("nid", e.target.value)}
          autoComplete="off"
        />
      )}
      {short ? null : (
        <>
          <TextField id={`${id}-email`} label={t("email")} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
          <TextField
            id={`${id}-dob`}
            label={t("dateOfBirth")}
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
          />
          <Field label={t("genderLabel")} htmlFor={`${id}-gender`}>
            <select
              id={`${id}-gender`}
              className={inputClass}
              value={values.gender}
              onChange={(e) => set("gender", e.target.value as Gender | "")}
            >
              <option value="">{t("genderNone")}</option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {t(`gender.${gender}`)}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}
