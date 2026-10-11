"use client";

import { HandCoins } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { useSubmit } from "@/components/property/use-submit";
import { api } from "@/lib/api/client";

/** "Close day and hand over": puts all the caller's cash in hand into one handover for the treasurer. */
export function HandoverButton({ amount, disabled }: { amount: string; disabled: boolean }) {
  const t = useTranslations("Collect");
  const { status, run } = useSubmit();
  return (
    <div className="grid gap-2">
      <ConfirmButton
        label={t("handOver")}
        question={t("handOverQuestion", { amount })}
        icon={HandCoins}
        disabled={disabled}
        onConfirm={async () => {
          await run(() => api.POST("/handovers"), t("handedOver"));
        }}
      />
      <FormStatus status={status} />
    </div>
  );
}
