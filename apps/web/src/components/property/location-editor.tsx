"use client";

import type { LocationNode } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

/** A location's name, holding number and active flag, plus delete (only while it is empty). */
export function LocationEditor({ location, canEdit, canDelete }: { location: LocationNode; canEdit: boolean; canDelete: boolean }) {
  const t = useTranslations("Property");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [name, setName] = useState(location.name);
  const [code, setCode] = useState(location.code ?? "");
  const [isActive, setIsActive] = useState(location.isActive);

  return (
    <div className="grid gap-3.5">
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

      {canDelete ? (
        <div className="grid gap-2 border-t border-line pt-3.5">
          <p className="text-[12.5px] text-muted-foreground">{t("deleteHint")}</p>
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
        </div>
      ) : null}
    </div>
  );
}
