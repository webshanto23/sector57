"use client";

import type { OrganisationDetail } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/** An organisation's name and trade licence, and delete when nothing refers to it. */
export function OrganisationEditor({ organisation }: { organisation: OrganisationDetail }) {
  const t = useTranslations("Members");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState({ name: organisation.name, tradeLicence: organisation.tradeLicence ?? "" });
  const id = organisation.id;

  return (
    <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid content-start gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.PATCH("/organisations/{id}", { params: { path: { id } }, body: values }));
          }}
        >
          <fieldset disabled={!organisation.can.edit} className="grid gap-3.5 min-[600px]:grid-cols-2">
            <TextField id="org-name" label={t("orgName")} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required />
            <TextField
              id="org-licence"
              label={t("tradeLicence")}
              hint={t("optional")}
              value={values.tradeLicence}
              onChange={(e) => setValues({ ...values, tradeLicence: e.target.value })}
            />
          </fieldset>
          <FormStatus status={status} />
          {organisation.can.edit ? (
            <Button type="submit" disabled={busy || !values.name.trim()} className="justify-self-start">
              {t("save")}
            </Button>
          ) : null}
        </form>
      </Card>

      {organisation.can.delete ? (
        <Card className="grid content-start gap-2">
          <p className="text-[12.5px] text-muted-foreground">{t("orgDeleteHint")}</p>
          <div>
            <ConfirmButton
              label={t("delete")}
              question={t("confirmDelete", { name: organisation.name })}
              icon={Trash2}
              destructive
              onConfirm={async () => {
                const done = await run(() => api.DELETE("/organisations/{id}", { params: { path: { id } } }));
                if (done !== undefined) router.push("/dashboard/owners");
              }}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
