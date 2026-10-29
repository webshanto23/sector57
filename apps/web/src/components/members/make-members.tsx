"use client";

import { localDigits, type Locale, type Place } from "@s57/shared";
import { BadgeCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, use, useState, type ReactNode } from "react";
import { TextField } from "@/components/cms/fields";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

type Ticks = { ticked: string[]; toggle: (id: string) => void };
/** A person or an organisation that can be made a member. */
export type MemberCandidate = { kind: "person" | "organisation"; id: string };
const TicksContext = createContext<Ticks | null>(null);

/**
 * Owners or renters list with tick boxes: the people and organisations who aren't members yet
 * (`eligible`, in page order) can be ticked and made members in one go, all joining on one day.
 * Ticks clear afterwards.
 */
export function MemberTicks({ eligible: candidates, children }: { eligible: MemberCandidate[]; children: ReactNode }) {
  const eligible = candidates.map((candidate) => candidate.id);
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run } = useSubmit();
  const [ticked, setTicked] = useState<string[]>([]);
  const [joinedOn, setJoinedOn] = useState("");
  // Rows that left the page (made members, filtered away) drop out of the ticks.
  const live = ticked.filter((id) => eligible.includes(id));
  const allTicked = eligible.length > 0 && live.length === eligible.length;

  const toggle = (id: string) => setTicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  const tickedOf = (kind: MemberCandidate["kind"]) => candidates.filter((c) => c.kind === kind && live.includes(c.id)).map((c) => c.id);

  return (
    <TicksContext value={{ ticked: live, toggle }}>
      {eligible.length > 0 ? (
        <Card className="mb-3.5">
          <form
            noValidate
            className="flex flex-wrap items-end gap-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run(() => api.POST("/memberships/bulk", { body: { personIds: tickedOf("person"), organisationIds: tickedOf("organisation"), joinedOn } }));
              if (!result) return;
              setTicked([]);
              setStatus({ ok: true, text: localDigits(t("madeMembers", { created: result.created.length, skipped: result.skipped }), locale) });
            }}
          >
            <label className="flex items-center gap-2 self-center text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allTicked}
                onChange={() => setTicked(allTicked ? [] : [...eligible])}
              />
              {t("tickAll")}
            </label>
            <TextField
              id="bulk-joined"
              label={t("joinedOn")}
              hint={t("joinedOnHint")}
              type="date"
              value={joinedOn}
              onChange={(e) => setJoinedOn(e.target.value)}
            />
            <Button type="submit" disabled={busy || live.length === 0}>
              <BadgeCheck aria-hidden />
              {localDigits(t("makeMembers", { count: live.length }), locale)}
            </Button>
            <div className="basis-full empty:hidden">
              <FormStatus status={status} />
            </div>
          </form>
        </Card>
      ) : null}
      {children}
    </TicksContext>
  );
}

/** The tick box on one row; only inside `MemberTicks`. */
export function TickBox({ id, name }: { id: string; name: string }) {
  const t = useTranslations("Members");
  const ticks = use(TicksContext);
  if (!ticks) return null;
  return (
    <input
      type="checkbox"
      className="size-4 accent-primary"
      aria-label={t("tickPerson", { name })}
      checked={ticks.ticked.includes(id)}
      onChange={() => ticks.toggle(id)}
    />
  );
}

const placeLabel = (place: Place) => [...place.address, place.name].join(", ");

/** "Make member" on a person's or organisation's page: the place (one of their current ones, or none) and the joined day. */
export function MakeMemberButton({ member, places }: { member: MemberCandidate; places: Place[] }) {
  const t = useTranslations("Members");
  const { status, busy, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [joinedOn, setJoinedOn] = useState("");

  if (!open) {
    return (
      <Button variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
        <BadgeCheck aria-hidden />
        {t("makeMember")}
      </Button>
    );
  }
  return (
    <Card>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const created = await run(() => api.POST("/memberships", {
              body: { ...(member.kind === "person" ? { personId: member.id } : { organisationId: member.id }), locationId: placeId || null, joinedOn },
            }));
          if (created) setOpen(false);
        }}
      >
        <p className="text-[13px] text-muted-foreground">{t("makeMemberHint")}</p>
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <Field label={t("memberPlace")} htmlFor="make-member-place">
            <select id="make-member-place" className={inputClass} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {placeLabel(place)}
                </option>
              ))}
              <option value="">{t("memberPlaceNone")}</option>
            </select>
          </Field>
          <TextField
            id="make-member-joined"
            label={t("joinedOn")}
            hint={t("joinedOnHint")}
            type="date"
            value={joinedOn}
            onChange={(e) => setJoinedOn(e.target.value)}
          />
        </div>
        <FormStatus status={status} />
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" disabled={busy}>
            {t("makeMember")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
