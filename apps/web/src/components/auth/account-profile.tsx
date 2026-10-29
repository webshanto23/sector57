"use client";

import { localDigits, type Locale, type Me } from "@s57/shared";
import { Camera, ImageOff, Lock, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { imageProblem, ImageUploadButton } from "@/components/cms/image-upload";
import { Avatar, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

/**
 * The "Logged in as" card: who is logged in, and with Edit their own name and photo
 * (their person record). A verified person's name is locked; the photo needs a saved name.
 */
export function AccountProfile({ me }: { me: Me }) {
  const t = useTranslations("Account");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(me.name ?? "");
  const [nameEn, setNameEn] = useState(me.nameEn ?? "");
  const shown = (locale === "en" ? me.nameEn : null) ?? me.name ?? localDigits(me.phone, locale);

  function close() {
    setEditing(false);
    setName(me.name ?? "");
    setNameEn(me.nameEn ?? "");
    setStatus(null);
  }

  async function upload([file]: File[]) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setStatus({ ok: false, text: tRoot(`Admin.errors.${problem}`) });
    setUploading(true);
    const result = await uploadFile("/me/photo", file);
    setUploading(false);
    if (!result.ok) return setStatus({ ok: false, text: tRoot(errorMessageKey(result.error)) });
    setStatus({ ok: true, text: tRoot("Admin.saved") });
    router.refresh();
  }

  async function save() {
    const saved = await run(() => api.PATCH("/me", { body: { name, nameEn } }));
    if (saved) setEditing(false);
  }

  return (
    <div className="grid gap-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={me.name ?? me.phone} src={me.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{shown}</p>
          <p className="text-[13px] text-muted-foreground">{localDigits(me.phone, locale)}</p>
        </div>
        {editing ? null : (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t("edit")}
          </Button>
        )}
      </div>

      {editing ? (
        <>
          {me.name === null ? (
            <p className="text-[12.5px] text-muted-foreground">{t("photoAfterName")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ImageUploadButton
                label={uploading ? t("uploading") : me.photoUrl ? t("changePhoto") : t("addPhoto")}
                icon={Camera}
                disabled={uploading || busy}
                onFiles={upload}
              />
              {me.photoUrl ? (
                <Button type="button" variant="outline" disabled={uploading || busy} onClick={() => run(() => api.DELETE("/me/photo"))}>
                  <ImageOff aria-hidden />
                  {t("removePhoto")}
                </Button>
              ) : null}
            </div>
          )}

          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={me.nameLocked} className="grid gap-3.5">
              <Field label={t("name")} htmlFor="account-name">
                <input id="account-name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t("nameEn")} htmlFor="account-name-en">
                <input id="account-name-en" lang="en" className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </Field>
            </fieldset>
            {me.nameLocked ? (
              <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                <Lock className="mt-0.5 size-[13px] flex-none" aria-hidden />
                {t("nameLocked")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {me.nameLocked ? null : (
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? t("saving") : t("saveName")}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>
                {me.nameLocked ? t("done") : t("cancel")}
              </Button>
            </div>
          </form>
        </>
      ) : null}
      <FormStatus status={status} />
    </div>
  );
}
