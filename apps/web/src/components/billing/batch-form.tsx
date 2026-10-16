"use client";

import { formatTaka, localDigits, MAX_BATCH_UNITS, type ChargeTypeList, type InvoiceBatchCheck, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FormStatus, Note, type Status } from "@/components/admin/form-status";
import { errorMessageKey } from "@/components/admin/errors";
import { Card, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { BatchUnitCard, linesTotal, newBatchLine, type BatchUnit } from "./batch-unit-card";
import { BatchUnitFinder } from "./batch-unit-finder";
import { BatchUnitPicker } from "./batch-unit-picker";

/**
 * Bills for several units at once (Step 27): add units, give each its own lines, set the
 * due date and months, then check (who pays, one bill per fund, earlier bills that look
 * the same) and make them all. Any change after the check asks for a fresh check.
 */
export function BatchForm({ chargeTypes, dueDefault }: { chargeTypes: ChargeTypeList; dueDefault: string }) {
  const t = useTranslations();
  const tb = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const active = chargeTypes.items.filter((type) => !type.archived);
  const keys = useRef(0);
  const nextKey = () => ++keys.current;

  const [units, setUnits] = useState<BatchUnit[]>([]);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [dueDate, setDueDate] = useState(dueDefault);
  const [checked, setChecked] = useState<{ body: string; result: InvoiceBatchCheck } | null>(null);
  const [failed, setFailed] = useState<{ unitId: string; text: string } | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const body = {
    dueDate,
    periodFrom: periodFrom || null,
    periodTo: (periodFrom && periodTo) || null,
    units: units.map(({ unit, lines }) => ({ unitId: unit.id, lines: lines.map(({ chargeTypeId, amount }) => ({ chargeTypeId, amount })) })),
  };
  const signature = JSON.stringify(body);
  const current = checked?.body === signature ? checked.result : null;
  const amountsOk = units.every(({ lines }) => linesTotal(lines) !== null);
  const blocked = current?.units.some((unit) => unit.problem) ?? true;

  function update(at: number, change: (item: BatchUnit) => BatchUnit) {
    setUnits((list) => list.map((item, i) => (i === at ? change(item) : item)));
    setFailed(null);
  }

  /** Sends the batch; reports a failure, naming its unit when the API says which. */
  async function send<T>(call: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T | undefined> {
    setStatus(null);
    setFailed(null);
    setBusy(true);
    try {
      const { data, error, response } = await call();
      if (response.ok && data) return data;
      const text = t(errorMessageKey(error));
      const unitId = (error as { details?: { unitId?: unknown } } | undefined)?.details?.unitId;
      const unit = typeof unitId === "string" ? units.find((item) => item.unit.id === unitId) : undefined;
      if (unit) setFailed({ unitId: unit.unit.id, text });
      setStatus({ ok: false, text: unit ? tb("batch.failedUnit", { unit: unit.unit.name, message: text }) : text });
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function check() {
    const result = await send(() => api.POST("/invoices/batch/check", { body }));
    if (result) setChecked({ body: signature, result });
  }

  async function create() {
    const result = await send(() => api.POST("/invoices/batch", { body }));
    if (result) router.push(`/dashboard/billing/print?made=1&ids=${result.invoices.map((bill) => bill.id).join(",")}`);
  }

  if (active.length === 0) return <Note tone="warn">{tb("new.noChargeTypes")}</Note>;

  return (
    <div className="grid max-w-[900px] gap-3.5">
      <BatchUnitFinder
        added={new Set(units.map((item) => item.unit.id))}
        full={units.length >= MAX_BATCH_UNITS}
        onAdd={(unit) => setUnits((list) => [...list, { unit, lines: [newBatchLine(nextKey(), active)] }])}
        action={
          <BatchUnitPicker
            added={new Set(units.map((item) => item.unit.id))}
            room={MAX_BATCH_UNITS - units.length}
            onAdd={(picked) =>
              setUnits((list) => [...list, ...picked.slice(0, MAX_BATCH_UNITS - list.length).map((unit) => ({ unit, lines: [newBatchLine(nextKey(), active)] }))])
            }
          />
        }
      />
      {units.length >= MAX_BATCH_UNITS ? <Note tone="warn">{tb("batch.tooMany", { max: localDigits(MAX_BATCH_UNITS, locale) })}</Note> : null}

      {units.length === 0 ? (
        <Note>{tb("batch.empty")}</Note>
      ) : (
        units.map((item, index) => (
          <BatchUnitCard
            key={item.unit.id}
            index={index}
            item={item}
            active={active}
            checked={current?.units.find((unit) => unit.unitId === item.unit.id) ?? null}
            failed={failed?.unitId === item.unit.id ? failed.text : null}
            nextKey={nextKey}
            onChange={(lines) => update(index, (it) => ({ ...it, lines }))}
            onRemove={() => setUnits((list) => list.filter((_, i) => i !== index))}
            onCopyAbove={
              index > 0 ? () => update(index, (it) => ({ ...it, lines: units[index - 1]!.lines.map((line) => ({ ...line, key: nextKey() })) })) : null
            }
          />
        ))
      )}

      <Card className="grid gap-3 min-[600px]:grid-cols-3">
        <Field label={tb("new.periodFrom")} htmlFor="batch-period-from">
          <input id="batch-period-from" type="month" className={inputClass} value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </Field>
        <Field label={tb("new.periodTo")} htmlFor="batch-period-to">
          <input
            id="batch-period-to"
            type="month"
            className={inputClass}
            value={periodTo}
            min={periodFrom || undefined}
            disabled={!periodFrom}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </Field>
        <Field label={tb("new.dueDate")} htmlFor="batch-due-date">
          <input id="batch-due-date" type="date" className={inputClass} value={dueDate} required onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <p className="text-[12.5px] text-muted-foreground min-[600px]:col-span-3">{tb("new.periodHint")}</p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px]">
          {current
            ? tb("batch.summary", {
                units: localDigits(current.units.length, locale),
                bills: localDigits(current.billCount, locale),
                total: formatTaka(current.total, locale),
              })
            : checked
              ? tb("batch.recheck")
              : units.length
                ? tb("batch.checkFirst")
                : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || units.length === 0 || !amountsOk} onClick={() => void check()}>
            {busy && !current ? tb("batch.checking") : tb("batch.check")}
          </Button>
          <Button type="button" disabled={busy || !current || blocked} onClick={() => void create()}>
            {busy && current ? tb("batch.creating") : current ? tb("batch.create", { count: localDigits(current.billCount, locale) }) : tb("batch.createPlain")}
          </Button>
        </div>
      </div>
      <FormStatus status={status} />
    </div>
  );
}
