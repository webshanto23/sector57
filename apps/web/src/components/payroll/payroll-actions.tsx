"use client";

import { formatTaka, pick, type Locale, type PayrollMonth, type PayrollRun } from "@s57/shared";
import { Ban, Check, FilePlus2, RefreshCw, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CASH, methodBody, methodReady, PaymentMethodField, type MethodValue } from "@/components/finance/payment-method-field";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** Prepares the month's draft (`payroll.create`). */
export function PreparePayroll({ month, label }: { month: string; label: string }) {
  const t = useTranslations("Payroll");
  const { status, busy, run } = useSubmit();
  return (
    <div className="grid gap-2 justify-self-start">
      <Button type="button" disabled={busy} onClick={() => void run(() => api.POST("/payroll", { body: { month } }), t("preparedNow"))}>
        <FilePlus2 aria-hidden />
        {label}
      </Button>
      <FormStatus status={status} />
    </div>
  );
}

/** The run's next steps for whoever may take them. The API checks each again. */
export function PayrollActions({ run, heads, meId }: { run: PayrollRun; heads: PayrollMonth["heads"]; meId: string }) {
  const t = useTranslations("Payroll.actions");
  const { can } = run;
  const ownDraft = run.status === "draft" && run.preparedBy?.id === meId;
  if (!can.edit && !can.approve && !can.pay && !can.void && !ownDraft) return null;

  return (
    <div className="grid content-start gap-3.5">
      {can.edit ? <Refresh run={run} /> : null}
      {can.approve ? <Approve run={run} /> : ownDraft ? <Note tone="info">{t("ownRun")}</Note> : null}
      {can.pay ? <Pay run={run} heads={heads} /> : null}
      {can.void ? <Void run={run} /> : null}
    </div>
  );
}

const path = (run: PayrollRun) => ({ params: { path: { id: run.id } } });

function Refresh({ run }: { run: PayrollRun }) {
  const t = useTranslations("Payroll.actions");
  const { status, busy, run: submit } = useSubmit();
  return (
    <Card className="grid gap-3">
      <p className="text-[13.5px] text-muted-foreground">{t("refreshHint")}</p>
      <div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(() => api.POST("/payroll/{id}/refresh", path(run)), t("refreshedNow"))}>
          <RefreshCw aria-hidden />
          {t("refresh")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function Approve({ run }: { run: PayrollRun }) {
  const t = useTranslations("Payroll.actions");
  const { status, busy, run: submit } = useSubmit();
  return (
    <Card className="grid gap-3">
      <p className="text-[13.5px] text-muted-foreground">{t("approveHint")}</p>
      <div>
        <Button type="button" disabled={busy} onClick={() => void submit(() => api.POST("/payroll/{id}/approve", path(run)), t("approvedNow"))}>
          <Check aria-hidden />
          {t("approve")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function Pay({ run, heads }: { run: PayrollRun; heads: PayrollMonth["heads"] }) {
  const t = useTranslations("Payroll.actions");
  const locale = useLocale() as Locale;
  const { status, run: submit } = useSubmit();
  const [paidBy, setPaidBy] = useState<MethodValue>(CASH);
  const [headId, setHeadId] = useState(heads[0]?.id ?? "");
  const amount = formatTaka(run.totals.net, locale);

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("payTitle")}</h2>
      <p className="text-[13.5px] text-muted-foreground">{t("payHint")}</p>
      {heads.length === 0 ? (
        <Note tone="warn">{t("noHeads")}</Note>
      ) : (
        <Field label={t("head")} htmlFor="payroll-pay-head">
          <select id="payroll-pay-head" className={inputClass} value={headId} onChange={(e) => setHeadId(e.target.value)}>
            {heads.map((head) => (
              <option key={head.id} value={head.id}>
                {pick(head.nameBn, head.nameEn, locale)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <PaymentMethodField id="payroll-pay" value={paidBy} onChange={setPaidBy} />
      </div>
      <div>
        <ConfirmButton
          label={t("pay", { amount })}
          question={t("payQuestion", { amount })}
          icon={Wallet}
          disabled={headId === "" || !methodReady(paidBy)}
          onConfirm={async () => {
            await submit(() => api.POST("/payroll/{id}/pay", { ...path(run), body: { ...methodBody(paidBy), headId } }), t("paidNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function Void({ run }: { run: PayrollRun }) {
  const t = useTranslations("Payroll.actions");
  const { status, run: submit } = useSubmit();
  const [reason, setReason] = useState("");
  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("voidTitle")}</h2>
      <p className="text-[13.5px] text-muted-foreground">{run.status === "paid" ? t("voidHintPaid") : t("voidHint")}</p>
      <Field label={t("voidReason")} htmlFor="payroll-void-reason">
        <input id="payroll-void-reason" className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div>
        <ConfirmButton
          label={t("void")}
          question={t("voidQuestion")}
          icon={Ban}
          destructive
          disabled={reason.trim() === ""}
          onConfirm={async () => {
            await submit(() => api.POST("/payroll/{id}/void", { ...path(run), body: { reason } }), t("voidedNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
