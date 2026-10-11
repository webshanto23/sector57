"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { ConfirmButton } from "./confirm-button";
import { errorMessageKey } from "./errors";
import { FormStatus, type Status } from "./form-status";

/** Deletes a role nobody holds; the API answers 409 `role_in_use` otherwise. */
export function DeleteRoleButton({ id, inUse }: { id: string; inUse: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(inUse ? { ok: false, text: t("Admin.errors.role_in_use") } : null);

  return (
    <div className="grid justify-items-start gap-2">
      <ConfirmButton
        label={t("Admin.roles.delete")}
        question={t("Admin.roles.confirmDelete")}
        icon={Trash2}
        destructive
        disabled={inUse}
        onConfirm={async () => {
          try {
            const { response, error } = await api.DELETE("/roles/{id}", { params: { path: { id } } });
            if (response.ok) router.push("/dashboard/roles");
            else setStatus({ ok: false, text: t(errorMessageKey(error)) });
          } catch {
            setStatus({ ok: false, text: t("Admin.errors.network") });
          }
        }}
      />
      {status ? <FormStatus status={status} /> : null}
    </div>
  );
}
