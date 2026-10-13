"use client";

import { pick, type Locale, type WorkOrderDetail } from "@s57/shared";
import { Check, Play, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextAreaField, TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

type Head = { id: string; nameBn: string; nameEn: string | null };

/**
 * Start, finish or cancel, as the user may. Finishing asks what was done and, for those who may
 * request expenses, the cost and its head: that becomes a pending expense request.
 */
export function WorkOrderActions({ order, today, heads }: { order: WorkOrderDetail; today: string; heads: Head[] }) {
  const t = useTranslations("WorkOrders");
  const locale = useLocale() as Locale;
  const start = useSubmit();
  const done = useSubmit();
  const cancel = useSubmit();
  const [completedOn, setCompletedOn] = useState(today);
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [headId, setHeadId] = useState(heads[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const path = { params: { path: { id: order.id } } };
  const can = (to: string) => order.can.statuses.some((status) => status === to);
  const withCost = cost.trim() !== "";

  return (
    <div className="grid content-start gap-3.5">
      {can("in_progress") ? (
        <Card className="grid gap-3">
          <h2 className="text-[15px]">{t("startTitle")}</h2>
          <Button type="button" variant="outline" className="justify-self-start" disabled={start.busy} onClick={() => void start.run(() => api.POST("/work-orders/{id}/start", path))}>
            <Play aria-hidden />
            {t("start")}
          </Button>
          <FormStatus status={start.status} />
        </Card>
      ) : null}

      {can("done") ? (
        <Card className="grid gap-3">
          <h2 className="text-[15px]">{t("doneTitle")}</h2>
          <TextField id="work-done-on" label={t("completedOn")} type="date" max={today} value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
          <TextAreaField id="work-done-note" label={t("completionNote")} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          {order.can.cost ? (
            <>
              <TextField id="work-done-cost" label={t("cost")} hint={t("costHint")} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
              {withCost ? (
                <Field label={t("head")} htmlFor="work-done-head">
                  <select id="work-done-head" className={inputClass} value={headId} onChange={(e) => setHeadId(e.target.value)}>
                    {heads.map((head) => (
                      <option key={head.id} value={head.id}>
                        {pick(head.nameBn, head.nameEn, locale)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">{t("noCostHint")}</p>
          )}
          <Button
            type="button"
            className="justify-self-start"
            disabled={done.busy || !completedOn || !note.trim() || (withCost && !headId)}
            onClick={() =>
              void done.run(() =>
                api.POST("/work-orders/{id}/done", { ...path, body: { completedOn, note, cost: withCost ? cost : null, headId: withCost ? headId : null } }),
              )
            }
          >
            <Check aria-hidden />
            {t("done")}
          </Button>
          <FormStatus status={done.status} />
        </Card>
      ) : null}

      {can("cancelled") ? (
        <Card className="grid gap-3">
          <h2 className="text-[15px]">{t("cancelTitle")}</h2>
          <TextField id="work-cancel-reason" label={t("cancelReason")} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            type="button"
            variant="destructive"
            className="justify-self-start"
            disabled={cancel.busy || !reason.trim()}
            onClick={() => void cancel.run(() => api.POST("/work-orders/{id}/cancel", { ...path, body: { reason } }))}
          >
            <X aria-hidden />
            {t("cancel")}
          </Button>
          <FormStatus status={cancel.status} />
        </Card>
      ) : null}
    </div>
  );
}
