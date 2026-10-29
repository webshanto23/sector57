"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  HOUSEHOLD_RELATIONS,
  localDigits,
  MAX_HOUSEHOLD,
  PUBLIC_RENTER_TYPES,
  renterFormNidSchema,
  renterFormSchema,
  type FormEntry,
  type FormReceipt,
  type Locale,
  type RenterForm,
  type RenterFormInput,
} from "@s57/shared";
import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { FieldMessage, TextField } from "@/components/cms/fields";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { FormError, useFormError } from "./form-error";
import { DocumentField, Honeypot } from "./form-parts";
import { PlacePicker } from "./place-picker";
import { submitForm, type FormSender } from "./submit";

/**
 * Renter registration: the renter, the flat, the move-in date, the flat's owner and the others in
 * the household. `send`: how the answers go out; the public website by default, `enterForm` from
 * the dashboard.
 */
export function RenterRegistration({
  onDone,
  nidRequired,
  send = submitForm,
}: {
  onDone: (receipt: FormReceipt | FormEntry) => void;
  nidRequired: boolean;
  send?: FormSender;
}) {
  const t = useTranslations("Forms");
  const tMembers = useTranslations("Members");
  const locale = useLocale() as Locale;
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const { formError, setFormError, showApiError } = useFormError();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RenterFormInput, unknown, RenterForm>({
    resolver: zodResolver(nidRequired ? renterFormNidSchema : renterFormSchema),
    defaultValues: {
      renter: { fullName: "", fullNameEn: "", phone: "", email: "", nid: "" },
      occupation: "",
      permanentAddress: "",
      renterType: "family",
      unitId: "",
      moveInDate: "",
      owner: { name: "", phone: "" },
      household: [],
    },
  });
  const household = useFieldArray({ control, name: "household" });

  async function onSubmit(values: RenterForm) {
    setFormError(null);
    const result = await send("renter_registration", values, file, honeypot);
    if (result.ok) return onDone(result.receipt);
    for (const issue of result.issues) setError(issue.path as FieldPath<RenterFormInput>, { message: issue.message });
    if (result.code === "unsupported_document" || result.code === "payload_too_large") setFileError(t(`errors.${result.code}`));
    else showApiError(result.code);
  }

  return (
    <form noValidate className="relative grid gap-3.5" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField id="rr-name" label={t("fullName")} autoComplete="name" error={errors.renter?.fullName} {...register("renter.fullName")} />
        <TextField id="rr-name-en" label={t("fullNameEn")} lang="en" error={errors.renter?.fullNameEn} {...register("renter.fullNameEn")} />
        <TextField id="rr-phone" label={t("phone")} type="tel" inputMode="tel" autoComplete="tel" error={errors.renter?.phone} {...register("renter.phone")} />
        <TextField id="rr-nid" label={t(nidRequired ? "nid" : "nidOptional")} hint={t("nidHint")} inputMode="numeric" error={errors.renter?.nid} {...register("renter.nid")} />
        <Field label={t("renterType")} htmlFor="rr-type">
          <select id="rr-type" className={inputClass} {...register("renterType")}>
            {PUBLIC_RENTER_TYPES.map((type) => (
              <option key={type} value={type}>
                {tMembers(`renterType.${type}`)}
              </option>
            ))}
          </select>
        </Field>
        <TextField id="rr-occupation" label={t("occupation")} error={errors.occupation} {...register("occupation")} />
        <TextField
          id="rr-address"
          className="min-[600px]:col-span-2"
          label={t("permanentAddress")}
          error={errors.permanentAddress}
          {...register("permanentAddress")}
        />
      </div>

      <div className="grid gap-1.5">
        <PlacePicker
          id="rr-place"
          invalid={!!errors.unitId}
          describedBy="rr-place-hint"
          onChange={(place) => setValue("unitId", place?.isUnit ? place.id : "", { shouldValidate: !!errors.unitId })}
        />
        <p id="rr-place-hint" className="text-[12.5px] text-muted-foreground">
          {t("placeHint.renter_registration")}
        </p>
        <FieldMessage id="rr-place" error={errors.unitId} />
      </div>

      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField id="rr-move-in" label={t("moveInDate")} type="date" error={errors.moveInDate} {...register("moveInDate")} />
        <span className="max-[599px]:hidden" />
        <TextField id="rr-owner" label={t("ownerName")} error={errors.owner?.name} {...register("owner.name")} />
        <TextField id="rr-owner-phone" label={t("ownerPhone")} type="tel" inputMode="tel" error={errors.owner?.phone} {...register("owner.phone")} />
      </div>

      <fieldset className="grid gap-2.5">
        <legend className="text-[13px] font-semibold">{t("household")}</legend>
        <p className="text-[12.5px] text-muted-foreground">{t("householdHint")}</p>
        {household.fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 min-[600px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
            <TextField
              id={`rr-hh-${index}-name`}
              className="max-[599px]:col-span-2"
              label={t("name")}
              error={errors.household?.[index]?.fullName}
              {...register(`household.${index}.fullName`)}
            />
            <Field label={t("relation")} htmlFor={`rr-hh-${index}-relation`}>
              <select id={`rr-hh-${index}-relation`} className={inputClass} {...register(`household.${index}.relation`)}>
                {HOUSEHOLD_RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {tMembers(`relation.${relation}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="button" variant="ghost" size="icon" aria-label={t("removePerson")} onClick={() => household.remove(index)}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {household.fields.length < MAX_HOUSEHOLD ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => household.append({ fullName: "", relation: household.fields.length === 0 ? "spouse" : "child" })}
          >
            <Plus aria-hidden />
            {t("addPerson")}
          </Button>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{localDigits(t("householdFull", { max: MAX_HOUSEHOLD }), locale)}</p>
        )}
      </fieldset>

      <DocumentField
        id="rr-nid-copy"
        label={t("nidCopy")}
        file={file}
        error={fileError}
        onChange={(picked, problem) => {
          setFile(picked);
          setFileError(problem);
        }}
      />

      <Honeypot value={honeypot} onChange={setHoneypot} />
      <FormError text={formError} />
      <p className="text-[12.5px] text-muted-foreground">{t("privacy")}</p>
      <Button type="submit" disabled={isSubmitting} className="justify-self-start">
        <CircleCheck aria-hidden />
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
