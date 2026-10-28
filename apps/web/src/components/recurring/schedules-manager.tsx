"use client";

import {
  formatDate,
  formatTaka,
  localDigits,
  moneySchema,
  pick,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_GENERATIONS,
  type ChargeTypeList,
  type Locale,
  type Schedule,
  type ScheduleList,
  type ScheduleStatus,
  type UnitTypeItem,
} from "@s57/shared";
import { CircleStop, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { PlacePicker } from "@/components/forms/place-picker";
import { Card, Chip, Field, inputClass, type Tone } from "@/components/kit";
import { unitTypeName } from "@/components/property/unit-types";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const STATUS_TONES: Record<ScheduleStatus, Tone> = { active: "good", paused: "warn", ended: "neutral" };

const monthLabel = (month: string, locale: Locale) => formatDate(`${month}-01`, locale, "monthYear");

/** Recurring charges: list, add, edit, pause, resume and end. Changes need a society-wide billing role. */
export function SchedulesManager({ list, chargeTypes, unitTypes, thisMonth }: { list: ScheduleList; chargeTypes: ChargeTypeList; unitTypes: UnitTypeItem[]; thisMonth: string }) {
  const t = useTranslations("Recurring");
  const [adding, setAdding] = useState(false);
  const active = list.items.filter((item) => item.status !== "ended");
  const ended = list.items.filter((item) => item.status === "ended");

  return (
    <div className="grid gap-3.5">
      {!list.canEdit ? <Note>{t("readOnly")}</Note> : null}
      {list.canEdit ? (
        adding ? (
          <Card className="grid gap-3">
            <h2 className="text-[15px]">{t("add")}</h2>
            <ScheduleForm chargeTypes={chargeTypes} unitTypes={unitTypes} thisMonth={thisMonth} onDone={() => setAdding(false)} />
          </Card>
        ) : (
          <Button type="button" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
        )
      ) : null}

      {active.length === 0 ? <Card className="text-muted-foreground">{t("empty")}</Card> : null}
      <ul className="grid gap-2.5">
        {active.map((item) => (
          <li key={item.id}>
            <ScheduleRow item={item} chargeTypes={chargeTypes} unitTypes={unitTypes} thisMonth={thisMonth} canEdit={list.canEdit} />
          </li>
        ))}
      </ul>
      {ended.length ? (
        <ul className="grid gap-2.5 opacity-75">
          {ended.map((item) => (
            <li key={item.id}>
              <ScheduleRow item={item} chargeTypes={chargeTypes} unitTypes={unitTypes} thisMonth={thisMonth} canEdit={false} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ScheduleRow({ item, chargeTypes, unitTypes, thisMonth, canEdit }: { item: Schedule; chargeTypes: ChargeTypeList; unitTypes: UnitTypeItem[]; thisMonth: string; canEdit: boolean }) {
  const t = useTranslations("Recurring");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const { status, busy, run } = useSubmit();
  const path = { params: { path: { id: item.id } } };

  if (editing) {
    return (
      <Card className="grid gap-3">
        <ScheduleForm item={item} chargeTypes={chargeTypes} unitTypes={unitTypes} thisMonth={thisMonth} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  const facts = [
    t(`frequency.${item.frequencyMonths ?? "once"}`),
    t(`generation.${item.generation}`),
    item.scope ? [...item.scope.address, item.scope.name].join(" › ") : t("everywhere"),
    item.unitTypes.length ? item.unitTypes.map((code) => unitTypeName(unitTypes, code, locale)).join(", ") : t("allTypes"),
    item.endMonth ? t("fromTo", { from: monthLabel(item.startMonth, locale), to: monthLabel(item.endMonth, locale) }) : t("from", { month: monthLabel(item.startMonth, locale) }),
  ];

  return (
    <Card className="grid gap-2">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{pick(item.nameBn, item.nameEn, locale)}</p>
          <p className="text-[13px] text-muted-foreground">
            {pick(item.chargeType.nameBn, item.chargeType.nameEn, locale)} · {t("amountEach", { amount: formatTaka(item.amount, locale) })}
            {item.rates.length ? ` · ${t("ratesCount", { count: localDigits(item.rates.length, locale) })}` : ""}
          </p>
          <p className="text-[13px] text-muted-foreground">{facts.join(" · ")}</p>
          <p className="text-[13px]">
            {item.nextRunOn ? t("nextRun", { month: formatDate(item.nextRunOn, locale, "monthYear") }) : t("noNextRun")} ·{" "}
            {t("dueAfter", { days: localDigits(item.dueDays, locale) })}
          </p>
        </div>
        <Chip tone={STATUS_TONES[item.status]}>{t(`status.${item.status}`)}</Chip>
      </div>
      {item.rates.length ? (
        <ul className="flex flex-wrap gap-1.5 text-[12.5px]">
          {item.rates.map((rate) => (
            <li key={rate.location.id} className="rounded-full bg-surface-2 px-2.5 py-0.5">
              {rate.location.name}: <span className="num">{formatTaka(rate.amount, locale)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && item.status !== "ended" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t("edit")}
          </Button>
          {item.status === "active" ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => api.POST("/schedules/{id}/pause", path), t("paused"))}>
              <Pause aria-hidden />
              {t("pause")}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => api.POST("/schedules/{id}/resume", path), t("resumed"))}>
              <Play aria-hidden />
              {t("resume")}
            </Button>
          )}
          <ConfirmButton
            label={t("end")}
            question={t("endQuestion")}
            icon={CircleStop}
            destructive
            onConfirm={async () => {
              await run(() => api.POST("/schedules/{id}/end", path), t("ended"));
            }}
          />
        </div>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}

type RateRow = { key: number; locationId: string | null; name: string | null; amount: string };

function ScheduleForm({ item, chargeTypes, unitTypes: unitTypeOptions, thisMonth, onDone }: { item?: Schedule; chargeTypes: ChargeTypeList; unitTypes: UnitTypeItem[]; thisMonth: string; onDone: () => void }) {
  const t = useTranslations("Recurring.form");
  const tR = useTranslations("Recurring");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const prefix = item ? `schedule-${item.id}` : "schedule-new";
  const types = chargeTypes.items.filter((type) => !type.archived || type.id === item?.chargeType.id);
  const fixed = item?.billed ?? false;

  const [nameBn, setNameBn] = useState(item?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(item?.nameEn ?? "");
  const [chargeTypeId, setChargeTypeId] = useState(item?.chargeType.id ?? types[0]?.id ?? "");
  const [amount, setAmount] = useState(item?.amount ?? types[0]?.defaultAmount ?? "");
  const [frequency, setFrequency] = useState<string>(item ? String(item.frequencyMonths ?? "once") : "1");
  const [generation, setGeneration] = useState(item?.generation ?? "auto");
  const [scope, setScope] = useState<{ id: string; name: string } | null>(item?.scope ? { id: item.scope.id, name: item.scope.name } : null);
  const [pickingScope, setPickingScope] = useState(false);
  const [unitTypes, setUnitTypes] = useState<string[]>(item?.unitTypes ?? []);
  const [startMonth, setStartMonth] = useState(item?.startMonth ?? thisMonth);
  const [endMonth, setEndMonth] = useState(item?.endMonth ?? "");
  const [dueDays, setDueDays] = useState(String(item?.dueDays ?? 15));
  const [rates, setRates] = useState<RateRow[]>(
    () => item?.rates.map((rate, key) => ({ key, locationId: rate.location.id, name: rate.location.name, amount: rate.amount })) ?? [],
  );
  const amountOk = moneySchema.safeParse(amount).success;

  async function save() {
    const body = {
      nameBn,
      nameEn,
      chargeTypeId,
      amount,
      rates: rates.filter((rate) => rate.locationId).map((rate) => ({ locationId: rate.locationId!, amount: rate.amount })),
      frequencyMonths: frequency === "once" ? null : (Number(frequency) as 1 | 3 | 6 | 12),
      generation,
      scopeLocationId: scope?.id ?? null,
      unitTypes,
      startMonth,
      endMonth: endMonth || null,
      dueDays: Number(dueDays),
    };
    const saved = await run(() => (item ? api.PUT("/schedules/{id}", { params: { path: { id: item.id } }, body }) : api.POST("/schedules", { body })));
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
      {fixed ? <Note>{t("fixedWhenBilled")}</Note> : null}
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("nameBn")} htmlFor={`${prefix}-bn`}>
          <input id={`${prefix}-bn`} className={inputClass} value={nameBn} required maxLength={150} onChange={(e) => setNameBn(e.target.value)} />
        </Field>
        <Field label={t("nameEn")} htmlFor={`${prefix}-en`}>
          <input id={`${prefix}-en`} lang="en" className={inputClass} value={nameEn} maxLength={150} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <p className="text-[12.5px] text-muted-foreground min-[600px]:col-span-2">{t("nameHint")}</p>
        <Field label={t("chargeType")} htmlFor={`${prefix}-type`}>
          <select
            id={`${prefix}-type`}
            className={inputClass}
            value={chargeTypeId}
            disabled={fixed}
            onChange={(e) => {
              const next = types.find((type) => type.id === e.target.value);
              if (amount === "" && next?.defaultAmount) setAmount(next.defaultAmount);
              setChargeTypeId(e.target.value);
            }}
          >
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {pick(type.nameBn, type.nameEn, locale)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount")} htmlFor={`${prefix}-amount`}>
          <input
            id={`${prefix}-amount`}
            inputMode="decimal"
            className={`${inputClass} num`}
            value={amount}
            aria-invalid={(amount !== "" && !amountOk) || undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <p className="text-[12.5px] text-muted-foreground min-[600px]:col-span-2">{t("amountHint")}</p>
        <Field label={t("frequency")} htmlFor={`${prefix}-frequency`}>
          <select id={`${prefix}-frequency`} className={inputClass} value={frequency} disabled={fixed} onChange={(e) => setFrequency(e.target.value)}>
            {[...SCHEDULE_FREQUENCIES.map((n) => String(n) as `${typeof n}`), "once" as const].map((value) => (
              <option key={value} value={value}>
                {tR(`frequency.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("generation")} htmlFor={`${prefix}-generation`}>
          <select id={`${prefix}-generation`} className={inputClass} value={generation} onChange={(e) => setGeneration(e.target.value as typeof generation)}>
            {SCHEDULE_GENERATIONS.map((value) => (
              <option key={value} value={value}>
                {tR(`generation.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("startMonth")} htmlFor={`${prefix}-start`}>
          <input
            id={`${prefix}-start`}
            type="month"
            className={inputClass}
            value={startMonth}
            min={fixed ? undefined : thisMonth}
            disabled={fixed}
            onChange={(e) => setStartMonth(e.target.value)}
          />
        </Field>
        <Field label={t("endMonth")} htmlFor={`${prefix}-end`}>
          <input id={`${prefix}-end`} type="month" className={inputClass} value={endMonth} min={startMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </Field>
        <Field label={t("dueDays")} htmlFor={`${prefix}-due`}>
          <input id={`${prefix}-due`} type="number" min={0} max={365} className={`${inputClass} num`} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-semibold">{t("scope")}</legend>
        {pickingScope ? (
          <PlacePicker
            id={`${prefix}-scope`}
            onChange={(place) => setScope(place ? { id: place.id, name: "" } : null)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <span>{scope ? scope.name : t("scopeAll")}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickingScope(true)}>
              {scope ? t("change") : t("scopePick")}
            </Button>
            {scope ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setScope(null)}>
                {t("scopeAll")}
              </Button>
            ) : null}
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-semibold">{t("unitTypes")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {unitTypeOptions.map(({ code: type, nameBn, nameEn }) => (
            <label key={type} className="inline-flex items-center gap-2 text-[13.5px]">
              <input
                type="checkbox"
                checked={unitTypes.includes(type)}
                onChange={(e) => setUnitTypes((current) => (e.target.checked ? [...current, type] : current.filter((value) => value !== type)))}
              />
              {pick(nameBn, nameEn, locale)}
            </label>
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">{t("unitTypesHint")}</p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-semibold">{t("rates")}</legend>
        <p className="text-[12.5px] text-muted-foreground">{t("ratesHint")}</p>
        <ul className="grid gap-2">
          {rates.map((rate, index) => (
            <li key={rate.key} className="grid gap-2 rounded-[8px] border border-line p-2.5 min-[600px]:grid-cols-[minmax(0,1fr)_160px_auto] min-[600px]:items-end">
              {rate.name ? (
                <p className="text-[13.5px] font-medium">{rate.name}</p>
              ) : (
                <PlacePicker
                  id={`${prefix}-rate-${rate.key}`}
                  onChange={(place) => setRates((current) => current.map((r, i) => (i === index ? { ...r, locationId: place?.id ?? null } : r)))}
                />
              )}
              <Field label={t("rateAmount")} htmlFor={`${prefix}-rate-${rate.key}-amount`}>
                <input
                  id={`${prefix}-rate-${rate.key}-amount`}
                  inputMode="decimal"
                  className={`${inputClass} num`}
                  value={rate.amount}
                  onChange={(e) => setRates((current) => current.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeRate")}
                title={t("removeRate")}
                onClick={() => setRates((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setRates((current) => [...current, { key: Math.max(-1, ...current.map((r) => r.key)) + 1, locationId: null, name: null, amount: "" }])}
        >
          <Plus aria-hidden />
          {t("addRate")}
        </Button>
      </fieldset>

      {!amountOk && amount !== "" ? <p className="text-[12.5px] text-bad">{tAll("Admin.errors.invalid_amount")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !amountOk || !nameBn.trim()}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
      <FormStatus status={status} />
    </form>
  );
}
