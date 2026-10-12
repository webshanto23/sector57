"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { api } from "@/lib/api/client";

/**
 * Voids a receipt with a reason. Shown only when the API says the caller may. A donation's
 * receipt is voided through the donation (`donationId`), with its own wording.
 */
export function PaymentVoidPanel({ id, donationId }: { id: string; donationId?: string }) {
  const tReceipt = useTranslations("Collect.detail");
  const tDonation = useTranslations("Donations.detail");
  const t = (key: "voidTitle" | "voidHint" | "voidReason" | "voidButton" | "voidQuestion" | "voidedNow") => (donationId ? tDonation(key) : tReceipt(key));
  const { status, run } = useSubmit();
  const [reason, setReason] = useState("");

  return (
    <Card className="grid content-start gap-3">
      <h2 className="text-[15px]">{t("voidTitle")}</h2>
      <p className="text-[13.5px] text-muted-foreground">{t("voidHint")}</p>
      <Field label={t("voidReason")} htmlFor="payment-void-reason">
        <input id="payment-void-reason" className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div>
        <ConfirmButton
          label={t("voidButton")}
          question={t("voidQuestion")}
          icon={Ban}
          destructive
          disabled={reason.trim() === ""}
          onConfirm={async () => {
            if (donationId) await run(() => api.POST("/donations/{id}/void", { params: { path: { id: donationId } }, body: { reason } }), t("voidedNow"));
            else await run(() => api.POST("/payments/{id}/void", { params: { path: { id } }, body: { reason } }), t("voidedNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
