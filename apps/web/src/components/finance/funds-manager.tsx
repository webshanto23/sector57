"use client";

import { formatDate, formatTaka, moneyOrZeroSchema, pick, type Fund, type FundList, type Locale } from "@s57/shared";
import { Landmark, Lock, Pencil, Plus, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Chip, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { todayInDhaka } from "@/lib/dhaka-time";

export type FundPermissions = { create: boolean; edit: boolean; settings: boolean };

/** Funds with what they hold in cash and at the bank, their opening balances, and adding or closing funds. */
export function FundsManager({ list, can }: { list: FundList; can: FundPermissions }) {
  const t = useTranslations("Finance.funds");
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid max-w-[1000px] gap-3.5">
      {list.separateFunds ? null : (
        <Note>
          {t("singleFund")}{" "}
          {can.settings ? (
            <Link href="/dashboard/settings" className="font-semibold underline">
              {t("openSettings")}
            </Link>
          ) : null}
        </Note>
      )}

      {list.separateFunds && can.create ? (
        adding ? (
          <Card className="grid gap-3">
            <h2 className="text-[15px]">{t("addTitle")}</h2>
            <NameForm onDone={() => setAdding(false)} />
          </Card>
        ) : (
          <Button type="button" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("addTitle")}
          </Button>
        )
      ) : null}

      <ul className="grid gap-3.5 min-[1100px]:grid-cols-2">
        {list.items.map((fund) => (
          <li key={fund.id}>
            <FundCard fund={fund} can={can} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FundCard({ fund, can }: { fund: Fund; can: FundPermissions }) {
  const t = useTranslations("Finance.funds");
  const locale = useLocale() as Locale;
  const [mode, setMode] = useState<"view" | "rename" | "opening">("view");
  const { status, run } = useSubmit();
  const closed = fund.closedAt !== null;

  return (
    <Card className={`grid gap-3 ${closed ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px]">{pick(fund.nameBn, fund.nameEn, locale)}</h2>
        {fund.isDefault ? <Chip tone="acc">{t("default")}</Chip> : null}
        {closed ? <Chip tone="neutral">{t("closed", { date: formatDate(fund.closedAt!, locale, "short") })}</Chip> : null}
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-[10px] bg-surface-2 p-3 text-center">
        {(
          [
            ["cash", Wallet],
            ["bank", Landmark],
            ["total", null],
          ] as const
        ).map(([key, Icon]) => (
          <div key={key} className="grid gap-0.5">
            <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
              {t(key)}
            </dt>
            <dd className={`num text-[14px] ${key === "total" ? "font-bold" : "font-semibold"}`}>{formatTaka(fund.balance[key], locale)}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[13px] text-muted-foreground">
        {fund.opening
          ? t("openingOn", {
              date: formatDate(fund.opening.date, locale, "long"),
              cash: formatTaka(fund.opening.cash, locale),
              bank: formatTaka(fund.opening.bank, locale),
            })
          : t("noOpening")}
        {fund.opening && !fund.openingEditable && !closed ? (
          <span className="ml-1 inline-flex items-center gap-1">
            <Lock className="size-3" aria-hidden />
            {t("openingFixed")}
          </span>
        ) : null}
      </p>

      {mode === "rename" ? <NameForm fund={fund} onDone={() => setMode("view")} /> : null}
      {mode === "opening" ? <OpeningForm fund={fund} onDone={() => setMode("view")} /> : null}

      {mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          {can.create && fund.openingEditable ? (
            <Button type="button" variant="outline" onClick={() => setMode("opening")}>
              <Wallet aria-hidden />
              {fund.opening ? t("correctOpening") : t("enterOpening")}
            </Button>
          ) : null}
          {can.edit ? (
            <Button type="button" variant="outline" onClick={() => setMode("rename")}>
              <Pencil aria-hidden />
              {t("rename")}
            </Button>
          ) : null}
          {can.edit && !fund.isDefault && !closed ? (
            <ConfirmButton
              label={t("close")}
              question={t("closeQuestion")}
              icon={Lock}
              destructive
              onConfirm={async () => {
                await run(() => api.POST("/funds/{id}/close", { params: { path: { id: fund.id } } }), t("closedNow"));
              }}
            />
          ) : null}
        </div>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}

/** Adds a fund, or renames one. */
function NameForm({ fund, onDone }: { fund?: Fund; onDone: () => void }) {
  const t = useTranslations("Finance.funds");
  const tCommon = useTranslations("Common");
  const { status, busy, run } = useSubmit();
  const [nameBn, setNameBn] = useState(fund?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(fund?.nameEn ?? "");
  const idPrefix = fund ? `fund-${fund.id}` : "fund-new";

  async function save() {
    const body = { nameBn, nameEn };
    const saved = await run(() =>
      fund ? api.PUT("/funds/{id}", { params: { path: { id: fund.id } }, body }) : api.POST("/funds", { body }),
    );
    if (saved) onDone();
  }

  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("nameBn")} htmlFor={`${idPrefix}-bn`}>
          <input id={`${idPrefix}-bn`} className={inputClass} value={nameBn} required onChange={(e) => setNameBn(e.target.value)} />
        </Field>
        <Field label={t("nameEn")} htmlFor={`${idPrefix}-en`}>
          <input id={`${idPrefix}-en`} lang="en" className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
      </div>
      <FormStatus status={status} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !nameBn.trim()}>
          {tCommon("save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** What the fund held on the day the society started using the system, in cash and at the bank. */
function OpeningForm({ fund, onDone }: { fund: Fund; onDone: () => void }) {
  const t = useTranslations("Finance.funds");
  const tAll = useTranslations();
  const { status, busy, run } = useSubmit();
  const today = todayInDhaka();
  const [date, setDate] = useState(fund.opening?.date ?? today);
  const [cash, setCash] = useState(fund.opening?.cash ?? "");
  const [bank, setBank] = useState(fund.opening?.bank ?? "");
  const cashOk = moneyOrZeroSchema.safeParse(cash || "0").success;
  const bankOk = moneyOrZeroSchema.safeParse(bank || "0").success;

  async function save() {
    const saved = await run(() =>
      api.PUT("/funds/{id}/opening", { params: { path: { id: fund.id } }, body: { date, cash: cash || "0", bank: bank || "0" } }),
    );
    if (saved) onDone();
  }

  const amountField = (id: string, label: string, value: string, set: (v: string) => void, ok: boolean) => (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        inputMode="decimal"
        className={`${inputClass} num`}
        value={value}
        placeholder="০"
        aria-invalid={!ok || undefined}
        aria-describedby={!ok ? `${id}-error` : undefined}
        onChange={(e) => set(e.target.value)}
      />
      {!ok ? (
        <span id={`${id}-error`} className="text-[12.5px] text-bad">
          {tAll("Admin.errors.invalid_amount")}
        </span>
      ) : null}
    </Field>
  );

  return (
    <form
      noValidate
      className="grid gap-3 rounded-[10px] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-[13px] text-muted-foreground">{fund.opening ? t("correctHint") : t("openingHint")}</p>
      <div className="grid gap-3 min-[600px]:grid-cols-3">
        <Field label={t("openingDate")} htmlFor={`opening-${fund.id}-date`}>
          <input id={`opening-${fund.id}-date`} type="date" max={today} className={inputClass} value={date} required onChange={(e) => setDate(e.target.value)} />
        </Field>
        {amountField(`opening-${fund.id}-cash`, t("cash"), cash, setCash, cashOk)}
        {amountField(`opening-${fund.id}-bank`, t("bank"), bank, setBank, bankOk)}
      </div>
      <FormStatus status={status} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !date || !cashOk || !bankOk}>
          {t("saveOpening")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          {tAll("Common.cancel")}
        </Button>
      </div>
    </form>
  );
}
