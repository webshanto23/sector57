"use client";

import { formatNumber, formatTaka, type CollectAccount, type CollectAreas, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Card, Field, inputClass } from "@/components/kit";
import { api } from "@/lib/api/client";
import { CollectAreaSelect } from "./collect-area-select";

const SEARCH_DELAY_MS = 300;

/** Find a unit or member as you type, or by area; with neither, the accounts with the newest open bills. */
export function CollectPicker({
  openAccounts,
  areas,
  onChoose,
}: {
  openAccounts: CollectAccount[];
  areas: CollectAreas["children"];
  onChoose: (account: CollectAccount) => void;
}) {
  const t = useTranslations("Collect");
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [areaId, setAreaId] = useState("");
  const [hits, setHits] = useState<CollectAccount[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the newest search may show its answer.
  const latest = useRef(0);

  function search(text: string, area: string) {
    clearTimeout(timer.current);
    const ask = ++latest.current;
    if (!text.trim() && !area) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => void find(text, area, ask), SEARCH_DELAY_MS);
  }

  async function find(text: string, area: string, ask: number) {
    try {
      // An area on its own lists the accounts with open bills there.
      const query = { ...(text.trim() ? { q: text } : { open: "true" }), ...(area ? { areaId: area } : {}) };
      const { data } = await api.GET("/collect/lookup", { params: { query } });
      if (ask === latest.current) setHits(data?.accounts ?? []);
    } finally {
      if (ask === latest.current) setSearching(false);
    }
  }

  return (
    <Card className="grid gap-3">
      <h2>{t("receive")}</h2>
      <Field label={t("find")} htmlFor="collect-q">
        <input
          id="collect-q"
          type="search"
          autoFocus
          className={inputClass}
          value={q}
          placeholder={t("findPlaceholder")}
          onChange={(e) => {
            setQ(e.target.value);
            search(e.target.value, areaId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </Field>
      <CollectAreaSelect
        top={areas}
        onChange={(next) => {
          setAreaId(next);
          search(q, next);
        }}
      />
      <div aria-live="polite" className="grid gap-2">
        {searching ? (
          <p className="text-[13px] text-muted-foreground">{t("searching")}</p>
        ) : hits ? (
          hits.length === 0 ? (
            <p className="text-[13.5px] text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("found", { count: formatNumber(hits.length, locale) })}</p>
          )
        ) : null}
        {hits ? (
          <AccountList accounts={hits} onChoose={onChoose} />
        ) : openAccounts.length ? (
          <>
            <h3 className="text-[13.5px] font-semibold text-muted-foreground">{t("openBills")}</h3>
            <AccountList accounts={openAccounts} onChoose={onChoose} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

/** Each account with money due is one big tap target; one with nothing due only says so. */
function AccountList({ accounts, onChoose }: { accounts: CollectAccount[]; onChoose: (account: CollectAccount) => void }) {
  const t = useTranslations("Collect");
  const tBilling = useTranslations("Billing");
  const locale = useLocale() as Locale;
  return (
    <ul className="grid gap-2">
      {accounts.map((hit) => {
        const where = hit.kind === "unit" ? hit.address.join(", ") : `${t("membershipFees")} · ${hit.membershipCode ? t("memberNo", { no: hit.membershipCode }) : tBilling("idPending")}`;
        return (
          <li key={`${hit.kind}-${hit.id}`}>
            {hit.bills.length ? (
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[8px] border border-line bg-surface p-2.5 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={() => onChoose(hit)}
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold">{hit.name}</span>
                  <span className="text-[13px] text-muted-foreground">{where}</span>
                </span>
                <b className="num whitespace-nowrap text-bad">{formatTaka(hit.due, locale)}</b>
              </button>
            ) : (
              <div className="flex min-h-14 items-center justify-between gap-3 rounded-[8px] bg-surface-2 p-2.5 text-muted-foreground">
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold">{hit.name}</span>
                  <span className="text-[13px]">{where}</span>
                </span>
                <span className="text-[13px] whitespace-nowrap">{t("nothingDue")}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
