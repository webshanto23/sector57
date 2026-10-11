"use client";

import { formatDate, type Locale, type PersonDetail } from "@s57/shared";
import { BadgeCheck, Camera, ImageOff, ShieldOff, Trash2 } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { imageProblem, ImageUploadButton } from "@/components/cms/image-upload";
import { Card, Chip } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";
import { emptyPerson, PersonFields, personBody, type PersonValues } from "./person-fields";

const toValues = (person: PersonDetail): PersonValues => ({
  fullName: person.fullName,
  fullNameEn: person.fullNameEn ?? "",
  phone: person.phone ?? "",
  email: person.email ?? "",
  nid: person.nid ?? "",
  dateOfBirth: person.dateOfBirth ?? "",
  gender: person.gender ?? "",
});

/** A new person not linked to any unit yet; opens their page once saved. */
export function NewPersonForm() {
  const t = useTranslations("Members");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<PersonValues>(emptyPerson);

  return (
    <Card>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const created = await run(() => api.POST("/persons", { body: personBody(values) }));
          if (created) router.push(`/dashboard/members/${created.id}`);
        }}
      >
        <PersonFields id="new-person" values={values} onChange={setValues} />
        <FormStatus status={status} />
        <Button type="submit" disabled={busy || !values.fullName.trim()} className="justify-self-start">
          {t("create")}
        </Button>
      </form>
    </Card>
  );
}

/** A person's details with save, verification, photo and delete, as far as the caller may. */
export function PersonEditor({ person }: { person: PersonDetail }) {
  const t = useTranslations("Members");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();
  const [values, setValues] = useState<PersonValues>(() => toValues(person));
  const [uploading, setUploading] = useState(false);
  const id = person.id;

  async function upload([file]: File[]) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setStatus({ ok: false, text: tRoot(`Admin.errors.${problem}`) });
    setUploading(true);
    const result = await uploadFile(`/persons/${id}/photo`, file);
    setUploading(false);
    if (!result.ok) return setStatus({ ok: false, text: tRoot(errorMessageKey(result.error)) });
    setStatus({ ok: true, text: tRoot("Admin.saved") });
    router.refresh();
  }

  return (
    <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid content-start gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.PATCH("/persons/{id}", { params: { path: { id } }, body: personBody(values) }));
          }}
        >
          <fieldset disabled={!person.can.edit} className="grid gap-3.5">
            <PersonFields id="person" values={values} onChange={setValues} nidHidden={!person.can.edit && person.hasNid} />
          </fieldset>
          {person.can.edit ? (
            <Button type="submit" disabled={busy || !values.fullName.trim()} className="justify-self-start">
              {t("save")}
            </Button>
          ) : null}
        </form>
        <FormStatus status={status} />
      </Card>

      <div className="grid content-start gap-3.5">
        <Card className="grid content-start gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {person.verifiedAt ? (
              <Chip tone="good">{t("verifiedOn", { date: formatDate(person.verifiedAt, locale, "short") })}</Chip>
            ) : (
              <Chip tone="warn">{t("notVerified")}</Chip>
            )}
          </div>
          {person.can.verify ? (
            <>
              {!person.verifiedAt ? <p className="text-[12.5px] text-muted-foreground">{t("verifyHint")}</p> : null}
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={busy}
                onClick={() =>
                  run(() => api.PUT("/persons/{id}/verified", { params: { path: { id } }, body: { verified: !person.verifiedAt } }))
                }
              >
                {person.verifiedAt ? <ShieldOff aria-hidden /> : <BadgeCheck aria-hidden />}
                {person.verifiedAt ? t("unverify") : t("verify")}
              </Button>
            </>
          ) : null}
        </Card>

        {person.can.edit ? (
          <Card className="flex flex-wrap items-center gap-2">
            {person.photoUrl ? (
              <Image src={person.photoUrl} alt="" width={74} height={74} unoptimized className="size-[74px] flex-none rounded-full object-cover" />
            ) : null}
            <ImageUploadButton
              label={uploading ? t("uploading") : person.photoUrl ? t("changePhoto") : t("addPhoto")}
              icon={Camera}
              disabled={uploading}
              onFiles={upload}
            />
            {person.photoUrl ? (
              <Button type="button" variant="outline" onClick={() => run(() => api.DELETE("/persons/{id}/photo", { params: { path: { id } } }))}>
                <ImageOff aria-hidden />
                {t("removePhoto")}
              </Button>
            ) : null}
          </Card>
        ) : null}

        {person.can.delete ? (
          <Card className="grid content-start gap-2">
            <p className="text-[12.5px] text-muted-foreground">{t("deleteHint")}</p>
            <div>
              <ConfirmButton
                label={t("delete")}
                question={t("confirmDelete", { name: person.fullName })}
                icon={Trash2}
                destructive
                onConfirm={async () => {
                  const done = await run(() => api.DELETE("/persons/{id}", { params: { path: { id } } }));
                  if (done !== undefined) router.push("/dashboard/members");
                }}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
