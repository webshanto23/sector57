"use client";

import { formatDate, isCommitteePosition, localDigits, pick, type CommitteeSeat, type Locale } from "@s57/shared";
import { Camera, ImageOff, Pencil, Trash2, UserPlus } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { Avatar, Card, Chip } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";
import { imageProblem, ImageUploadButton } from "../image-upload";
import { useSave } from "../use-save";
import { SeatForm } from "./seat-form";

export type CommitteePermissions = { create: boolean; edit: boolean; delete: boolean };

type Term = { key: string; start: string; end: string | null; seats: CommitteeSeat[] };

/** Seats grouped by term (start and end date), newest first, each in display order. */
function groupByTerm(seats: CommitteeSeat[]): Term[] {
  const terms = new Map<string, Term>();
  for (const seat of seats) {
    const key = `${seat.termStart}|${seat.termEnd ?? ""}`;
    const term = terms.get(key) ?? { key, start: seat.termStart, end: seat.termEnd, seats: [] };
    term.seats.push(seat);
    terms.set(key, term);
  }
  return [...terms.values()].sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? 1 : -1));
}

/** Today's date in Dhaka as `YYYY-MM-DD`. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

/** The committee in the dashboard: terms, seats, portraits; add, edit and remove. */
export function CommitteeManager({ seats, can }: { seats: CommitteeSeat[]; can: CommitteePermissions }) {
  const t = useTranslations("Cms.committee");
  const locale = useLocale() as Locale;
  const [adding, setAdding] = useState(false);
  const terms = groupByTerm(seats);
  const now = today();
  const latest = terms[0];

  return (
    <div className="grid gap-3.5">
      {can.create ? (
        adding ? (
          <Card className="grid gap-3.5">
            <h2 className="text-[15px]">{t("addTitle")}</h2>
            <SeatForm
              defaults={
                latest
                  ? { termStart: latest.start, termEnd: latest.end, sortOrder: Math.max(...latest.seats.map((s) => s.sortOrder)) + 1 }
                  : undefined
              }
              onDone={() => setAdding(false)}
            />
          </Card>
        ) : (
          <Button type="button" className="justify-self-start" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            {t("addTitle")}
          </Button>
        )
      ) : null}

      {terms.length === 0 ? <Card className="text-muted-foreground">{t("empty")}</Card> : null}

      {terms.map((term) => {
        const current = term.start <= now && (term.end === null || term.end >= now);
        return (
          <section key={term.key} className="grid gap-2.5" aria-label={termLabel(term, locale, t)}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px]">{termLabel(term, locale, t)}</h2>
              {current ? <Chip tone="good">{t("current")}</Chip> : term.start > now ? <Chip tone="info">{t("upcoming")}</Chip> : null}
            </div>
            <ul className="grid gap-2.5 min-[1100px]:grid-cols-2">
              {term.seats.map((seat) => (
                <li key={seat.id}>
                  <SeatCard seat={seat} can={can} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function termLabel(term: Term, locale: Locale, t: ReturnType<typeof useTranslations<"Cms.committee">>) {
  const start = formatDate(term.start, locale, "short");
  return term.end ? t("termRange", { start, end: formatDate(term.end, locale, "short") }) : t("termOpen", { start });
}

function SeatCard({ seat, can }: { seat: CommitteeSeat; can: CommitteePermissions }) {
  const t = useTranslations("Cms.committee");
  const tAll = useTranslations();
  const tPos = useTranslations("Committee.position");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { status, setStatus, run, afterChange } = useSave();
  const name = pick(seat.nameBn, seat.nameEn, locale);

  async function upload([file]: File[]) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) {
      setStatus({ ok: false, text: tAll(`Admin.errors.${problem}`) });
      return;
    }
    setStatus(null);
    setUploading(true);
    try {
      const result = await uploadFile<CommitteeSeat>(`/committee/members/${seat.id}/photo`, file);
      if (result.ok) await afterChange(t("photoSaved"));
      else setStatus({ ok: false, text: tAll(errorMessageKey(result.error)) });
    } catch {
      setStatus({ ok: false, text: tAll("Admin.errors.network") });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="grid gap-3">
      <div className="flex items-center gap-3">
        {seat.photoUrl ? (
          <Image src={seat.photoUrl} alt="" width={52} height={52} unoptimized className="size-[52px] flex-none rounded-full object-cover" />
        ) : (
          <Avatar name={name} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <p className="text-[13px] text-muted-foreground">
            {isCommitteePosition(seat.position) ? tPos(seat.position) : seat.position}
            {" · "}
            {t("orderN", { n: localDigits(seat.sortOrder, locale) })}
          </p>
          {seat.phone ? <p className="num text-[12.5px] text-muted-foreground">{localDigits(seat.phone, locale)}</p> : null}
        </div>
      </div>

      {editing ? (
        <SeatForm seat={seat} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {can.edit ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {t("edit")}
              </Button>
              <ImageUploadButton
                label={uploading ? t("uploading") : seat.photoUrl ? t("changePhoto") : t("addPhoto")}
                icon={Camera}
                disabled={uploading}
                onFiles={upload}
              />
              {seat.photoUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => run(() => api.DELETE("/committee/members/{id}/photo", { params: { path: { id: seat.id } } }))}
                >
                  <ImageOff aria-hidden />
                  {t("removePhoto")}
                </Button>
              ) : null}
            </>
          ) : null}
          {can.delete ? (
            <ConfirmButton
              label={t("remove")}
              question={t("confirmRemove", { name })}
              icon={Trash2}
              destructive
              onConfirm={async () => {
                await run(() => api.DELETE("/committee/members/{id}", { params: { path: { id: seat.id } } }));
              }}
            />
          ) : null}
        </div>
      )}
      <FormStatus status={status} />
    </Card>
  );
}
