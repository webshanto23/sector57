"use client";

import { CHARGE_KINDS, formatTaka, optionalMoneySchema, pick, type ChargeKind, type ChargeType, type ChargeTypeList, type Locale } from "@s57/shared";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Chip, Field, inputClass, type Tone } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** Changes need a society-wide billing role; the API checks it again. */
export type ChargeTypePermissions = { create: boolean; edit: boolean };

const KIND_TONES: Record<ChargeKind, Tone> = { due: "info", fee: "acc", fine: "warn" };

/** What bills can charge for: list, add, edit, archive and restore. */
export function ChargeTypesManager({ list, can }: { list: ChargeTypeList; can: ChargeTypePermissions }) {
  const t = useTranslations("Finance.chargeTypes");
  const [adding, setAdding] = useState(false);
  const active = list.items.filter((item) => !item.archived);
  const archived = list.items.filter((item) => item.archived);

  return (
    <div className="grid max-w-[1000px] gap-3.5">
      {!can.create && !can.edit ? <Note>{t("readOnly")}</Note> : null}

      {can.create ? (
        adding ? (
          <Card className="grid gap-3">
            <h2 className="text-[15px]">{t("addTitle")}</h2>
            <ChargeTypeForm list={list} onDone={() => setAdding(false)} />
          </Card>
        ) : (
          <Button type="button" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("addTitle")}
          </Button>
        )
      ) : null}

      {active.length === 0 ? <Card className="text-muted-foreground">{t("empty")}</Card> : null}
      <ul className="grid gap-2.5">
        {active.map((item) => (
          <li key={item.id}>
            <ChargeTypeRow item={item} list={list} can={can} />
          </li>
        ))}
      </ul>

      {archived.length ? (
        <section className="grid gap-2.5" aria-labelledby="archived-charge-types">
          <h2 id="archived-charge-types" className="text-[14px] text-muted-foreground">
            {t("archivedTitle")}
          </h2>
          <ul className="grid gap-2.5">
            {archived.map((item) => (
              <li key={item.id}>
                <ChargeTypeRow item={item} list={list} can={can} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ChargeTypeRow({ item, list, can }: { item: ChargeType; list: ChargeTypeList; can: ChargeTypePermissions }) {
  const t = useTranslations("Finance.chargeTypes");
  const tKind = useTranslations("Finance.chargeKind");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const { status, busy, run } = useSubmit();
  const path = { params: { path: { id: item.id } } };

  if (editing) {
    return (
      <Card className="grid gap-3">
        <ChargeTypeForm list={list} item={item} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card className={`grid gap-2 ${item.archived ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{pick(item.nameBn, item.nameEn, locale)}</p>
          <p className="text-[13px] text-muted-foreground">
            {list.separateFunds || !item.fund.isDefault ? `${pick(item.fund.nameBn, item.fund.nameEn, locale)} · ` : ""}
            {item.defaultAmount ? t("defaultAmount", { amount: formatTaka(item.defaultAmount, locale) }) : t("noDefault")}
          </p>
        </div>
        <Chip tone={KIND_TONES[item.kind]}>{tKind(item.kind)}</Chip>
        {can.edit ? (
          <div className="flex gap-1.5">
            {!item.archived ? (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => (item.archived ? api.POST("/charge-types/{id}/restore", path) : api.POST("/charge-types/{id}/archive", path)),
                  item.archived ? t("restored") : t("archived"),
                )
              }
            >
              {item.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {item.archived ? t("restore") : t("archive")}
            </Button>
          </div>
        ) : null}
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function ChargeTypeForm({ list, item, onDone }: { list: ChargeTypeList; item?: ChargeType; onDone: () => void }) {
  const t = useTranslations("Finance.chargeTypes");
  const tKind = useTranslations("Finance.chargeKind");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const defaultFund = list.funds.find((fund) => fund.isDefault) ?? list.funds[0];
  const [nameBn, setNameBn] = useState(item?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(item?.nameEn ?? "");
  const [kind, setKind] = useState<ChargeKind>(item?.kind ?? "due");
  const [fundId, setFundId] = useState(item?.fund.id ?? defaultFund?.id ?? "");
  const [amount, setAmount] = useState(item?.defaultAmount ?? "");
  const amountOk = optionalMoneySchema.safeParse(amount).success;
  const idPrefix = item ? `charge-${item.id}` : "charge-new";
  // The current fund stays selectable while editing even if it isn't offered for new charge types.
  const funds = item && !list.funds.some((fund) => fund.id === item.fund.id) ? [item.fund, ...list.funds] : list.funds;

  async function save() {
    const body = { nameBn, nameEn, kind, fundId, defaultAmount: amount };
    const saved = await run(() =>
      item ? api.PUT("/charge-types/{id}", { params: { path: { id: item.id } }, body }) : api.POST("/charge-types", { body }),
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
        <Field label={t("kind")} htmlFor={`${idPrefix}-kind`}>
          <select id={`${idPrefix}-kind`} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)}>
            {CHARGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount")} htmlFor={`${idPrefix}-amount`}>
          <input
            id={`${idPrefix}-amount`}
            inputMode="decimal"
            className={`${inputClass} num`}
            value={amount}
            placeholder={t("amountPlaceholder")}
            aria-invalid={!amountOk || undefined}
            aria-describedby={!amountOk ? `${idPrefix}-amount-error` : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          {!amountOk ? (
            <span id={`${idPrefix}-amount-error`} className="text-[12.5px] text-bad">
              {tAll("Admin.errors.invalid_amount")}
            </span>
          ) : null}
        </Field>
        {list.separateFunds ? (
          <Field label={t("fund")} htmlFor={`${idPrefix}-fund`}>
            <select id={`${idPrefix}-fund`} className={inputClass} value={fundId} onChange={(e) => setFundId(e.target.value)}>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {pick(fund.nameBn, fund.nameEn, locale)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <p className="text-[13px] text-muted-foreground">{t("kindHint")}</p>
      <FormStatus status={status} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !nameBn.trim() || !amountOk || !fundId}>
          {tAll("Common.save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          {tAll("Common.cancel")}
        </Button>
      </div>
    </form>
  );
}
