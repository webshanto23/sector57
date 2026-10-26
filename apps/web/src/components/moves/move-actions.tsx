"use client";

import { type MoveCheckKey, type MoveDetail } from "@s57/shared";
import { Ban, Check, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** The checklist, planned date and note of an open move; read-only once done or cancelled. */
export function MoveChecklist({ move }: { move: MoveDetail }) {
  const t = useTranslations("Moves");
  const { status, busy, run } = useSubmit();
  const [planned, setPlanned] = useState(move.plannedDate ?? "");
  const [note, setNote] = useState(move.note ?? "");
  const path = { params: { path: { id: move.id } } };
  const tick = (key: MoveCheckKey, done: boolean) => void run(() => api.PATCH("/moves/{id}", { ...path, body: { checklist: { [key]: done } } }));

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("checklist")}</h2>
      <ul className="grid gap-2">
        {move.checklist.map((item) => (
          <li key={item.key}>
            <label className="flex items-start gap-2.5 text-[14px]">
              <input
                type="checkbox"
                className="mt-1"
                checked={item.done}
                disabled={!move.can.edit || busy}
                onChange={(e) => tick(item.key, e.target.checked)}
              />
              <span className={item.done ? "" : "text-muted-foreground"}>{t(`check.${item.key}`)}</span>
            </label>
          </li>
        ))}
      </ul>
      {move.can.edit ? (
        <div className="grid gap-2.5 border-t border-line pt-3 min-[600px]:grid-cols-[200px_1fr]">
          <Field label={t("plannedDate")} htmlFor="move-planned">
            <input id="move-planned" type="date" className={inputClass} value={planned} onChange={(e) => setPlanned(e.target.value)} />
          </Field>
          <Field label={t("note")} htmlFor="move-note">
            <input id="move-note" className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="min-[600px]:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => api.PATCH("/moves/{id}", { ...path, body: { plannedDate: planned || null, note: note.trim() || null } }))}
            >
              <Save aria-hidden />
              {t("save")}
            </Button>
          </div>
        </div>
      ) : move.note ? (
        <p className="border-t border-line pt-3 text-[13.5px]">
          <b>{t("note")}:</b> {move.note}
        </p>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}

/** Complete on a date (with the dues warning for a move-out), or cancel. The API checks both again. */
export function MoveActions({ move, today }: { move: MoveDetail; today: string }) {
  const t = useTranslations("Moves");
  const { status, run } = useSubmit();
  const [date, setDate] = useState(move.kind === "move_in" ? (move.plannedDate && move.plannedDate < today ? move.plannedDate : today) : today);
  const owes = move.kind === "move_out" && move.dues !== null && move.dues.owed !== "0.00";
  const blocked = owes && !move.can.overrideDues;
  const path = { params: { path: { id: move.id } } };

  return (
    <div className="grid gap-3.5">
      {move.can.complete ? (
        <Card className="grid gap-3">
          <h2 className="text-[15px]">{t(`complete.${move.kind}`)}</h2>
          <p className="text-[13.5px] text-muted-foreground">{t(`completeHint.${move.kind}`)}</p>
          {owes ? <Note tone="warn">{move.can.overrideDues ? t("overrideNote") : t("duesBlock")}</Note> : null}
          {move.kind === "move_out" && move.dues === null ? <Note>{t("duesHidden")}</Note> : null}
          <Field label={t(`completeDate.${move.kind}`)} htmlFor="move-complete-date">
            <input id="move-complete-date" type="date" className={`${inputClass} sm:w-auto!`} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div>
            <ConfirmButton
              label={t(`complete.${move.kind}`)}
              question={t(`completeQuestion.${move.kind}`)}
              icon={Check}
              disabled={blocked || date === ""}
              onConfirm={async () => {
                await run(() => api.POST("/moves/{id}/complete", { ...path, body: { date } }), t("completedNow"));
              }}
            />
          </div>
        </Card>
      ) : null}
      {move.can.cancel ? (
        <Card className="grid gap-3">
          <h2 className="text-[15px]">{t("cancel")}</h2>
          <p className="text-[13.5px] text-muted-foreground">{t(`cancelHint.${move.kind}`)}</p>
          <div>
            <ConfirmButton
              label={t("cancel")}
              question={t("cancelQuestion")}
              icon={Ban}
              destructive
              onConfirm={async () => {
                await run(() => api.POST("/moves/{id}/cancel", path), t("cancelledNow"));
              }}
            />
          </div>
        </Card>
      ) : null}
      <FormStatus status={status} />
    </div>
  );
}
