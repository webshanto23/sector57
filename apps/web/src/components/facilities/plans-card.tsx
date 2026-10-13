"use client";

import { formatDate, localDigits, MAX_ASSET_PLANS, pick, upkeepState, type AssetDetail, type Locale, type MaintenancePlan } from "@s57/shared";
import { Check, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card, Chip, type Tone } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const TONES: Record<ReturnType<typeof upkeepState>, Tone> = { overdue: "bad", due: "warn", ok: "neutral" };

/** When a plan is next due, coloured overdue (red) or due soon (amber). */
export function DueChip({ nextDueOn, today }: { nextDueOn: string; today: string }) {
  const t = useTranslations("Assets");
  const locale = useLocale() as Locale;
  const state = upkeepState(nextDueOn, today);
  return <Chip tone={TONES[state]}>{t(`due.${state}`, { date: formatDate(nextDueOn, locale, "short") })}</Chip>;
}

/** Marks one plan done on a day (today unless changed); the next due day moves on. */
export function MarkDone({ planId, today, lastDoneOn }: { planId: string; today: string; lastDoneOn: string | null }) {
  const t = useTranslations("Assets");
  const { status, busy, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [doneOn, setDoneOn] = useState(today);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Check aria-hidden />
        {t("markDone")}
      </Button>
    );
  }
  return (
    <div className="grid gap-2 rounded-lg border border-line p-2.5">
      <div className="grid gap-2 min-[600px]:grid-cols-[180px_1fr]">
        <TextField id={`done-on-${planId}`} label={t("doneOn")} type="date" min={lastDoneOn ?? undefined} max={today} value={doneOn} onChange={(e) => setDoneOn(e.target.value)} />
        <TextField id={`done-note-${planId}`} label={t("doneNote")} hint={t("optional")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !doneOn}
          onClick={async () => {
            const done = await run(() => api.POST("/assets/plans/{id}/done", { params: { path: { id: planId } }, body: { doneOn, note: note || null } }), t("doneSaved"));
            if (done !== undefined) setOpen(false);
          }}
        >
          <Check aria-hidden />
          {t("doneSave")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
      <FormStatus status={status} />
    </div>
  );
}

function PlanRow({ plan, today, canEdit }: { plan: MaintenancePlan; today: string; canEdit: boolean }) {
  const t = useTranslations("Assets");
  const locale = useLocale() as Locale;
  const { status, run } = useSubmit();

  return (
    <li className="grid gap-2 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid">
          <span className="font-semibold">{pick(plan.task.bn, plan.task.en, locale)}</span>
          <span className="text-[12.5px] text-muted-foreground">
            {t("every", { months: plan.everyMonths, shown: localDigits(plan.everyMonths, locale) })}
            {plan.lastDoneOn ? ` · ${t("lastDone", { date: formatDate(plan.lastDoneOn, locale, "short") })}` : ""}
          </span>
        </div>
        <DueChip nextDueOn={plan.nextDueOn} today={today} />
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-start gap-2">
          <MarkDone planId={plan.id} today={today} lastDoneOn={plan.lastDoneOn} />
          <ConfirmButton
            label={plan.lastDoneOn ? t("stopPlan") : t("removePlan")}
            question={plan.lastDoneOn ? t("stopQuestion") : t("removeQuestion")}
            icon={Trash2}
            onConfirm={async () => {
              await run(() => api.DELETE("/assets/plans/{id}", { params: { path: { id: plan.id } } }));
            }}
          />
        </div>
      ) : null}
      <FormStatus status={status} />
    </li>
  );
}

/** The asset's upkeep: open plans with when each is due, and (for editors) adding one. */
export function PlansCard({ asset, today }: { asset: AssetDetail; today: string }) {
  const t = useTranslations("Assets");
  const { status, busy, run } = useSubmit();
  const [taskBn, setTaskBn] = useState("");
  const [taskEn, setTaskEn] = useState("");
  const [every, setEvery] = useState("3");
  const [nextDueOn, setNextDueOn] = useState(today);
  const months = Number(every);
  const ready = taskBn.trim() !== "" && Number.isInteger(months) && months >= 1 && months <= 120 && nextDueOn !== "";

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("plansTitle")}</h2>
      {asset.plans.length === 0 ? <p className="text-[13px] text-muted-foreground">{t("plansNone")}</p> : null}
      {asset.plans.length > 0 ? (
        <ul className="grid gap-2.5 text-[13.5px]">
          {asset.plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} today={today} canEdit={asset.can.edit} />
          ))}
        </ul>
      ) : null}
      {asset.can.edit && asset.plans.length < MAX_ASSET_PLANS ? (
        <form
          noValidate
          className="grid gap-2.5 border-t border-line pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const added = await run(() =>
              api.POST("/assets/{id}/plans", { params: { path: { id: asset.id } }, body: { taskBn, taskEn: taskEn || null, everyMonths: months, nextDueOn } }),
            );
            if (added) {
              setTaskBn("");
              setTaskEn("");
            }
          }}
        >
          <h3 className="text-[13.5px] font-semibold">{t("addPlan")}</h3>
          <div className="grid gap-2.5 min-[600px]:grid-cols-2">
            <TextField id="plan-task" label={t("task")} hint={t("taskHint")} value={taskBn} maxLength={150} onChange={(e) => setTaskBn(e.target.value)} />
            <TextField id="plan-task-en" label={t("taskEn")} hint={t("optional")} value={taskEn} maxLength={150} lang="en" onChange={(e) => setTaskEn(e.target.value)} />
            <TextField id="plan-every" label={t("everyMonths")} type="number" min={1} max={120} inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} />
            <TextField id="plan-first" label={t("firstDue")} type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={busy || !ready} className="justify-self-start">
            <Plus aria-hidden />
            {t("addPlanSave")}
          </Button>
          <FormStatus status={status} />
        </form>
      ) : null}
    </Card>
  );
}
