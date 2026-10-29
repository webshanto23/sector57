"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { membershipFormSchema, type FormReceipt, type MembershipForm, type MembershipFormInput } from "@s57/shared";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { FieldMessage, TextField } from "@/components/cms/fields";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DocumentField, Honeypot } from "./form-parts";
import { PlacePicker } from "./place-picker";
import { FormError, useFormError } from "./form-error";
import { submitForm } from "./submit";

/**
 * The mockup's membership application: name, mobile, NID, the place owned, living there or not,
 * and the deed. An organisation applies with its name and trade licence; the applicant is its
 * contact person and their NID is optional.
 */
export function MembershipApplication({ onDone }: { onDone: (receipt: FormReceipt) => void }) {
  const t = useTranslations("Forms");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const { formError, setFormError, showApiError } = useFormError();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    unregister,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MembershipFormInput, unknown, MembershipForm>({
    resolver: zodResolver(membershipFormSchema),
    defaultValues: { applicantKind: "person", applicant: { fullName: "", fullNameEn: "", phone: "", email: "", nid: "" }, locationId: "", livesHere: true },
  });

  const organisation = useWatch({ control, name: "applicantKind" }) === "organisation";

  async function onSubmit(values: MembershipForm) {
    setFormError(null);
    if (!file) return setFileError(t("errors.file_required"));
    const result = await submitForm("membership", values, file, honeypot);
    if (result.ok) return onDone(result.receipt);
    for (const issue of result.issues) setError(issue.path as FieldPath<MembershipFormInput>, { message: issue.message });
    if (result.code === "file_required" || result.code === "unsupported_document" || result.code === "payload_too_large") {
      setFileError(t(`errors.${result.code}`));
    } else {
      showApiError(result.code);
    }
  }

  return (
    <form noValidate className="relative grid gap-3.5" onSubmit={handleSubmit(onSubmit, () => !file && setFileError(t("errors.file_required")))}>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1.5 text-[13px] font-semibold">{t("applyingAs")}</legend>
        {(["person", "organisation"] as const).map((kind) => (
          <label key={kind} className="inline-flex items-center gap-2 text-[13.5px]">
            <input
              type="radio"
              value={kind}
              {...register("applicantKind", { onChange: () => kind === "person" && unregister("organisation") })}
            />
            {t(`applicantKinds.${kind}`)}
          </label>
        ))}
      </fieldset>
      {organisation ? (
        <>
          <div className="grid gap-3.5 min-[600px]:grid-cols-2">
            <TextField id="ma-org" label={t("orgName")} error={errors.organisation?.name} {...register("organisation.name")} />
            <TextField id="ma-licence" label={t("tradeLicence")} error={errors.organisation?.tradeLicence} {...register("organisation.tradeLicence")} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">{t("contactHint")}</p>
        </>
      ) : null}
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField id="ma-name" label={t("fullName")} autoComplete="name" error={errors.applicant?.fullName} {...register("applicant.fullName")} />
        <TextField id="ma-name-en" label={t("fullNameEn")} lang="en" error={errors.applicant?.fullNameEn} {...register("applicant.fullNameEn")} />
        <TextField id="ma-phone" label={t("phone")} type="tel" inputMode="tel" autoComplete="tel" error={errors.applicant?.phone} {...register("applicant.phone")} />
        <TextField id="ma-nid" label={t(organisation ? "nidOptional" : "nid")} hint={t("nidHint")} inputMode="numeric" error={errors.applicant?.nid} {...register("applicant.nid")} />
        <TextField id="ma-email" label={t("email")} type="email" autoComplete="email" error={errors.applicant?.email} {...register("applicant.email")} />
        <Field label={t("iAm")} htmlFor="ma-lives">
          <select id="ma-lives" className={inputClass} {...register("livesHere", { setValueAs: (value: unknown) => value === true || value === "true" })}>
            <option value="true">{t("livesHere")}</option>
            <option value="false">{t("livesElsewhere")}</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-1.5">
        <PlacePicker
          id="ma-place"
          invalid={!!errors.locationId}
          describedBy="ma-place-hint"
          onChange={(place) => setValue("locationId", place?.belowTop ? place.id : "", { shouldValidate: !!errors.locationId })}
        />
        <p id="ma-place-hint" className="text-[12.5px] text-muted-foreground">
          {t("placeHint.membership")}
        </p>
        <FieldMessage id="ma-place" error={errors.locationId} />
      </div>

      <DocumentField
        id="ma-deed"
        label={t("deed")}
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
