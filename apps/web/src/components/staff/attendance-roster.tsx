"use client";

import { ATTENDANCE_STATUSES, attendanceHasTimes, localDigits, pick, type AttendanceDay, type AttendanceStatus, type Locale } from "@s57/shared";
import { cn } from "cn";
import { CheckCheck, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ATTENDANCE_CELL } from "./attendance-tone";

type Draft = { status: AttendanceStatus | null; inTime: string; outTime: string; note: string };

const fromDay = (day: AttendanceDay): Record<string, Draft> =>
  Object.fromEntries(
    day.items.map((item) => [
      item.staff.id,
      { status: item.mark?.status ?? null, inTime: item.mark?.inTime ?? "", outTime: item.mark?.outTime ?? "", note: item.mark?.note ?? "" },
    ]),
  );

const same = (a: Draft, b: Draft) => a.status === b.status && a.inTime === b.inTime && a.outTime === b.outTime && a.note === b.note;

/**
 * The day's roster: one tap sets a staff member's status, times and a note are optional, and
 * Save sends only what changed. Rows the caller may not change are shown read-only.
 */
export function AttendanceRoster({ day }: { day: AttendanceDay }) {
  const t = useTranslations("Attendance");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [saved, setSaved] = useState(() => fromDay(day));
  const [drafts, setDrafts] = useState(saved);
  // A new roster from the server (another day, or after saving) replaces the drafts.
  const [shown, setShown] = useState(day);
  if (shown !== day) {
    setShown(day);
    const next = fromDay(day);
    setSaved(next);
    setDrafts(next);
  }

  const set = (id: string, change: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id]!, ...change } }));
  const changed = day.items.filter((item) => item.editable && !same(drafts[item.staff.id]!, saved[item.staff.id]!) && drafts[item.staff.id]!.status !== null);
  const unmarked = day.items.filter((item) => item.editable && drafts[item.staff.id]!.status === null);

  async function save() {
    const entries = changed.map((item) => {
      const draft = drafts[item.staff.id]!;
      const times = attendanceHasTimes(draft.status!);
      return {
        staffId: item.staff.id,
        status: draft.status!,
        inTime: times ? draft.inTime || null : null,
        outTime: times ? draft.outTime || null : null,
        note: draft.note.trim() || null,
      };
    });
    await run(() => api.PUT("/attendance", { body: { date: day.date, entries } }), t("savedNow"));
  }

  if (day.items.length === 0) {
    return (
      <Card flat className="text-[13.5px] text-muted-foreground">
        {t("nobody")}
      </Card>
    );
  }

  return (
    <div className="grid gap-3.5">
      {day.locked ? <Note tone="warn">{t("locked")}</Note> : null}
      {unmarked.length > 0 ? (
        <div>
          <Button type="button" variant="outline" onClick={() => unmarked.forEach((item) => set(item.staff.id, { status: "present" }))}>
            <CheckCheck aria-hidden />
            {t("restPresent", { count: unmarked.length })}
          </Button>
        </div>
      ) : null}

      <ul className="grid gap-2.5">
        {day.items.map((item) => {
          const draft = drafts[item.staff.id]!;
          const id = `att-${item.staff.id}`;
          return (
            <li key={item.staff.id}>
              <Card className="grid gap-2.5 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="num text-muted-foreground">{localDigits(item.staff.staffNo, locale)}.</span> {pick(item.staff.name, item.staff.nameEn, locale)}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {[pick(item.staff.designation.bn, item.staff.designation.en, locale), item.staff.posted].filter(Boolean).join(" · ")}
                  </p>
                  {item.mark?.markedBy ? <p className="text-[12px] text-muted-foreground">{t("markedBy", { name: item.mark.markedBy.name })}</p> : null}
                </div>

                <fieldset disabled={!item.editable || busy} className="grid gap-2">
                  <legend className="sr-only">{t("statusFor", { name: item.staff.name })}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTENDANCE_STATUSES.map((option) => (
                      <label
                        key={option}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold has-[:disabled]:cursor-default has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                          draft.status === option ? `border-transparent ${ATTENDANCE_CELL[option]}` : "border-line text-muted-foreground",
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={id}
                          value={option}
                          checked={draft.status === option}
                          onChange={() => set(item.staff.id, { status: option })}
                        />
                        {t(`status.${option}`)}
                      </label>
                    ))}
                  </div>
                  {draft.status ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {attendanceHasTimes(draft.status) ? (
                        <>
                          <input
                            type="time"
                            aria-label={t("inTime")}
                            className={`${inputClass} w-auto`}
                            value={draft.inTime}
                            onChange={(e) => set(item.staff.id, { inTime: e.target.value })}
                          />
                          <span aria-hidden className="text-muted-foreground">
                            –
                          </span>
                          <input
                            type="time"
                            aria-label={t("outTime")}
                            className={`${inputClass} w-auto`}
                            value={draft.outTime}
                            onChange={(e) => set(item.staff.id, { outTime: e.target.value })}
                          />
                        </>
                      ) : null}
                      <input
                        aria-label={t("note")}
                        placeholder={t("note")}
                        className={`${inputClass} min-w-0 flex-1 min-[900px]:w-44 min-[900px]:flex-none`}
                        maxLength={300}
                        value={draft.note}
                        onChange={(e) => set(item.staff.id, { note: e.target.value })}
                      />
                    </div>
                  ) : null}
                </fieldset>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface p-3 shadow-sm">
        <Button type="button" disabled={busy || changed.length === 0} onClick={() => void save()}>
          <Save aria-hidden />
          {t("save")}
        </Button>
        <span className="text-[13px] text-muted-foreground">{changed.length > 0 ? t("changedCount", { count: changed.length }) : t("noChanges")}</span>
      </div>
      <FormStatus status={status} />
    </div>
  );
}
