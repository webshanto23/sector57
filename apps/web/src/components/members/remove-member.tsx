"use client";

import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { api } from "@/lib/api/client";

/**
 * Takes back a membership made by mistake. Shown only while the membership ID is pending; the API
 * also refuses once the ID is issued or while a membership bill isn't void.
 */
export function RemoveMemberCard({ membershipId, name }: { membershipId: string; name: string }) {
  const t = useTranslations("Members");
  const { status, run } = useSubmit();

  return (
    <Card className="grid content-start gap-2">
      <p className="text-[12.5px] text-muted-foreground">{t("removeMemberHint")}</p>
      <div>
        <ConfirmButton
          label={t("removeMember")}
          question={t("removeMemberQuestion", { name })}
          icon={UserMinus}
          destructive
          onConfirm={async () => {
            await run(() => api.DELETE("/memberships/{id}", { params: { path: { id: membershipId } } }), t("memberRemoved"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
