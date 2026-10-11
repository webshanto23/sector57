"use client";

import type { FormDetail } from "@s57/shared";
import { CircleCheck, CircleX, SearchCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CheckField, TextAreaField, TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const todayInDhaka = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * What the office does with an open application, as far as the caller may: start the review,
 * approve (membership: optionally also record the owner; renter: the tenancy's start and rent),
 * or reject with a reason. The page reloads with the outcome.
 */
export function DecisionPanel({ form }: { form: FormDetail }) {
  const t = useTranslations("FormsAdmin");
  const { status, busy, run } = useSubmit();
  const id = form.id;
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [addOwnership, setAddOwnership] = useState(false);
  const [sharePercent, setSharePercent] = useState("100");
  const [startDate, setStartDate] = useState(form.renter?.moveInDate ?? todayInDhaka());
  const [monthlyRent, setMonthlyRent] = useState("");
  const open = form.status === "new" || form.status === "in_review";

  if (!open || !(form.can.review || form.can.approve || form.can.reject)) return <FormStatus status={status} />;

  return (
    <div className="grid content-start gap-3.5">
      {form.can.review ? (
        <Card className="grid content-start gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={busy}
            onClick={() => run(() => api.POST("/forms/{id}/review", { params: { path: { id } }, body: { note: note || null } }))}
          >
            <SearchCheck aria-hidden />
            {t("markReview")}
          </Button>
        </Card>
      ) : null}

      {form.can.approve ? (
        <Card className="grid content-start gap-3.5">
          <h2 className="text-[15px]">{t("approve")}</h2>
          <p className="text-[13px] text-muted-foreground">{t(`approveHint.${form.formKey}`)}</p>
          {form.formKey === "membership" && form.can.addOwnership ? (
            <>
              <CheckField
                id="fa-own"
                label={t("addOwnership")}
                hint={t("addOwnershipHint")}
                checked={addOwnership}
                onChange={(e) => setAddOwnership(e.target.checked)}
              />
              {addOwnership ? (
                <div className="grid gap-3.5 min-[600px]:grid-cols-2">
                  <TextField id="fa-share" label={t("sharePercent")} inputMode="decimal" value={sharePercent} onChange={(e) => setSharePercent(e.target.value)} />
                  <TextField id="fa-own-start" label={t("ownershipStart")} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
              ) : null}
            </>
          ) : null}
          {form.formKey === "renter_registration" ? (
            <div className="grid gap-3.5 min-[600px]:grid-cols-2">
              <TextField id="fa-ten-start" label={t("tenancyStart")} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <TextField id="fa-rent" label={t("monthlyRent")} inputMode="decimal" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
            </div>
          ) : null}
          <TextAreaField id="fa-note" label={t("note")} placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            type="button"
            className="justify-self-start"
            disabled={busy}
            onClick={() =>
              run(() =>
                api.POST("/forms/{id}/approve", {
                  params: { path: { id } },
                  body:
                    form.formKey === "membership"
                      ? { note: note || null, addOwnership, sharePercent, ...(addOwnership && startDate ? { startDate } : {}) }
                      : { note: note || null, addOwnership: false, startDate: startDate || undefined, monthlyRent: monthlyRent || null },
                }),
              )
            }
          >
            <CircleCheck aria-hidden />
            {t("approve")}
          </Button>
        </Card>
      ) : form.can.reject ? (
        <Note tone="warn">{t("noApproveRight")}</Note>
      ) : null}

      {form.can.reject ? (
        <Card className="grid content-start gap-2.5">
          <TextAreaField
            id="fa-reason"
            label={t("rejectReason")}
            placeholder={t("rejectReasonHint")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div>
            <ConfirmButton
              label={t("reject")}
              question={t("confirmReject")}
              icon={CircleX}
              destructive
              disabled={busy || !reason.trim()}
              onConfirm={async () => {
                await run(() => api.POST("/forms/{id}/reject", { params: { path: { id } }, body: { note: reason } }));
              }}
            />
          </div>
        </Card>
      ) : null}

      <FormStatus status={status} />
    </div>
  );
}
