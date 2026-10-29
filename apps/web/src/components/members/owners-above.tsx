"use client";

import { pick, type Locale, type LocationPeople } from "@s57/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PartyLink, PlaceLink } from "./labels";

type AboveOwner = NonNullable<LocationPeople["ownersAbove"]>[number];

/** "Plot Owner: …; Plot Name: …; Property Map: …": one owner of a place above. */
function AboveOwnerLine({ row }: { row: AboveOwner }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const level = pick(row.levelBn, row.levelEn, locale);
  return (
    <li className="grid gap-0.5 rounded-[10px] border border-line bg-surface p-2.5">
      <span>
        <span className="text-muted-foreground">{t("people.aboveOwner", { level })}: </span>
        <PartyLink party={row.owner} />
      </span>
      <span>
        <span className="text-muted-foreground">{t("people.aboveName", { level })}: </span>
        <span className="font-medium">{row.place.name}</span>
      </span>
      <span>
        <span className="text-muted-foreground">{t("people.aboveMap")}: </span>
        <PlaceLink place={row.place} />
      </span>
    </li>
  );
}

/** Owners of the places above, kept behind a button so the card shows this place's owners first. */
export function OwnersAbove({ rows }: { rows: AboveOwner[] }) {
  const t = useTranslations("Members");
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-2 text-[13px]">
      <Button type="button" size="sm" variant="outline" className="justify-self-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        {open ? t("people.hideOwnersAbove") : t("people.showOwnersAbove")}
      </Button>
      {open ? (
        <div className="grid gap-1.5 rounded-[10px] bg-surface-2 p-3">
          <p className="font-semibold">{t("people.ownersAbove")}</p>
          <p className="text-[12.5px] text-muted-foreground">{t("people.ownersAboveHint")}</p>
          <ul className="grid gap-1.5">
            {rows.map((row) => (
              <AboveOwnerLine key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
