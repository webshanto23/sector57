"use client";

import { localDigits, pick, type Locale, type MemberRegisterRow } from "@s57/shared";
import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** A member picked by membership ID: their record on file is linked as it is. */
export type PickedMember = Pick<MemberRegisterRow, "membershipCode" | "person">;

/** Searches active members by membership ID (or name, or phone); clicking one picks them. */
export function MemberLookup({ id, onPick }: { id: string; onPick: (member: PickedMember) => void }) {
  const t = useTranslations("Members.people");
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MemberRegisterRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function find() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.GET("/registers/members", { params: { query: { q, pageSize: 10 } } });
      setHits(data?.items ?? []);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Field label={t("memberLookup")} htmlFor={`${id}-member`}>
        <div className="flex gap-2">
          <input
            id={`${id}-member`}
            type="search"
            className={`${inputClass} min-w-0 flex-1`}
            value={q}
            placeholder={t("memberLookupPlaceholder")}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void find();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={searching || !q.trim()} onClick={() => void find()}>
            <Search aria-hidden />
            {t("memberSearch")}
          </Button>
        </div>
      </Field>
      {hits ? (
        hits.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("memberNoMatch")}</p>
        ) : (
          <ul className="grid gap-1.5">
            {hits.map((row) => (
              <li key={row.person.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2 text-left hover:bg-surface-2"
                  onClick={() => onPick({ membershipCode: row.membershipCode, person: row.person })}
                >
                  <MemberLine member={row} locale={locale} />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <p className="text-[12.5px] text-muted-foreground">{t("memberLookupHint")}</p>
    </div>
  );
}

function MemberLine({ member, locale }: { member: PickedMember; locale: Locale }) {
  const tMembers = useTranslations("Members");
  const name = pick(member.person.name, member.person.nameEn, locale);
  return (
    <>
      <Avatar name={name} src={member.person.photoUrl} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate font-semibold">{name}</span>
        <span className="num truncate text-[12.5px] text-muted-foreground">
          {member.membershipCode ? localDigits(member.membershipCode, locale) : tMembers("idPending")}
          {member.person.phone ? ` · ${localDigits(member.person.phone, locale)}` : ""}
        </span>
      </span>
    </>
  );
}

/** The picked member, read-only, with a button to pick someone else or type a new owner. */
export function PickedMemberCard({ member, onClear }: { member: PickedMember; onClear: () => void }) {
  const t = useTranslations("Members.people");
  const locale = useLocale() as Locale;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 p-2.5">
        <MemberLine member={member} locale={locale} />
        <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0" onClick={onClear}>
          <X aria-hidden />
          {t("memberChange")}
        </Button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("memberPickedHint")}</p>
    </div>
  );
}
