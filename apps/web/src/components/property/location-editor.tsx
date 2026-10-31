"use client";

import { pick, type Locale, type LocationNode } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

/** The Details tab: a location's name, holding number and active flag, and delete beside them (only while it is empty). */
export function LocationEditor({ location, canEdit, canDelete }: { location: LocationNode; canEdit: boolean; canDelete: boolean }) {
  const t = useTranslations("Property");
  const { status, busy, run } = useSubmit();
  const [name, setName] = useState(location.name);
  const [code, setCode] = useState(location.code ?? "");
  const [isActive, setIsActive] = useState(location.isActive);

  return (
    <div className={canDelete ? "grid items-start gap-3.5 min-[861px]:grid-cols-[1.6fr_1fr]" : "grid gap-3.5"}>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        {!canEdit && !canDelete ? <Note>{t("readOnly")}</Note> : null}
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.PATCH("/locations/{id}", { params: { path: { id: location.id } }, body: { name, code, isActive } }));
          }}
        >
          <fieldset disabled={!canEdit} className="grid gap-3.5">
            <div className="grid gap-3.5 min-[600px]:grid-cols-2">
              <TextField id="location-name" label={t("name")} value={name} onChange={(e) => setName(e.target.value)} required />
              <TextField id="location-code" label={t("code")} hint={t("codeHint")} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <CheckField
              id="location-active"
              label={t("active")}
              hint={t("activeHint")}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
          </fieldset>
          <FormStatus status={status} />
          {canEdit ? (
            <Button type="submit" disabled={busy || !name.trim()} className="justify-self-start">
              {t("save")}
            </Button>
          ) : null}
        </form>
      </Card>
      {canDelete ? <DeleteCard location={location} /> : null}
    </div>
  );
}

function DeleteCard({ location }: { location: LocationNode }) {
  const t = useTranslations("Property");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, run } = useSubmit();
  return (
    <Card className="grid gap-2.5 border-bad/30">
      <h2 className="text-[15px] text-bad">{t("deleteTitle", { level: pick(location.levelBn, location.levelEn, locale) })}</h2>
      <p className="text-[13px] text-muted-foreground">{t("deleteHint")}</p>
      <FormStatus status={status} />
      <div>
        <ConfirmButton
          label={t("delete")}
          question={t("confirmDelete", { name: location.name })}
          icon={Trash2}
          destructive
          disabled={location.childCount > 0}
          onConfirm={async () => {
            const done = await run(() => api.DELETE("/locations/{id}", { params: { path: { id: location.id } } }));
            if (done !== undefined) router.push(location.parentId ? `/dashboard/property/${location.parentId}` : "/dashboard/property");
          }}
        />
      </div>
    </Card>
  );
}
