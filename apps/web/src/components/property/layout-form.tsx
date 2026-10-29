"use client";

import { BILL_TO, buildingLayoutSchema, expandLayout, localDigits, pick, type BillTo, type Locale, type UnitTypeItem } from "@s57/shared";
import { Layers } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { FieldError } from "react-hook-form";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

const issue = (message: string): FieldError => ({ type: "custom", message });

/**
 * "Set up floors and units" for an empty building: floors from a numbered pattern and the
 * units on each, with a live preview. Exceptions (shops, units over several floors) are fixed afterwards.
 */
export function LayoutForm({ locationId, unitTypes }: { locationId: string; unitTypes: UnitTypeItem[] }) {
  const t = useTranslations("Property.layout");
  const tp = useTranslations("Property");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [floors, setFloors] = useState({ from: "1", to: "6", pattern: t("floorPatternDefault"), groundName: t("groundNameDefault"), groundHasUnits: false });
  const [units, setUnits] = useState({ letters: "", pattern: t("unitPatternDefault") });
  const [bangla, setBangla] = useState(locale === "bn");
  const [unitType, setUnitType] = useState(unitTypes[0]?.code ?? "");
  const [sizeSqft, setSizeSqft] = useState("");
  const [billTo, setBillTo] = useState<BillTo>("owner");

  const body = { floors, units, bangla, unitType, sizeSqft, billTo };
  const parsed = buildingLayoutSchema.safeParse(body);
  const preview = useMemo(() => (parsed.success ? expandLayout(parsed.data) : []), [parsed.success, parsed.data]);
  const errorAt = (path: string) => {
    const found = parsed.success ? undefined : parsed.error.issues.find((item) => item.path.join(".") === path);
    return found ? issue(found.message) : undefined;
  };
  const unitTotal = preview.reduce((sum, floor) => sum + floor.units.length, 0);
  const ground = floors.from.trim() === "0";

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Layers aria-hidden />
          {t("open")}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.success) return;
          const message = localDigits(t("done", { floors: preview.length, units: unitTotal }), locale);
          void run(() => api.POST("/locations/{id}/layout", { params: { path: { id: locationId } }, body: parsed.data }), message);
        }}
      >
        <h3 className="font-semibold">{t("title")}</h3>

        <fieldset className="grid gap-3.5">
          <legend className="mb-2 text-[13.5px] font-semibold">{t("floors")}</legend>
          <div className="grid gap-3.5 min-[600px]:grid-cols-[1fr_1fr_2fr]">
            <TextField id="layout-from" label={tp("from")} type="number" min={0} value={floors.from} onChange={(e) => setFloors({ ...floors, from: e.target.value })} />
            <TextField
              id="layout-to"
              label={tp("to")}
              type="number"
              min={0}
              value={floors.to}
              error={errorAt("floors.to")}
              onChange={(e) => setFloors({ ...floors, to: e.target.value })}
            />
            <TextField
              id="layout-floor-pattern"
              label={t("floorPattern")}
              hint={t("floorPatternHint")}
              value={floors.pattern}
              error={errorAt("floors.pattern")}
              onChange={(e) => setFloors({ ...floors, pattern: e.target.value })}
            />
          </div>
          {ground ? (
            <div className="grid gap-3.5 min-[600px]:grid-cols-2 min-[600px]:items-center">
              <TextField
                id="layout-ground"
                label={t("groundName")}
                value={floors.groundName}
                error={errorAt("floors.groundName")}
                onChange={(e) => setFloors({ ...floors, groundName: e.target.value })}
              />
              <CheckField
                id="layout-ground-units"
                label={t("groundHasUnits")}
                checked={floors.groundHasUnits}
                onChange={(e) => setFloors({ ...floors, groundHasUnits: e.target.checked })}
              />
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3.5">
          <legend className="mb-2 text-[13.5px] font-semibold">{t("unitsOnEach")}</legend>
          <div className="grid gap-3.5 min-[600px]:grid-cols-2">
            <TextField
              id="layout-letters"
              label={tp("letters")}
              hint={t("lettersHint")}
              value={units.letters}
              error={errorAt("units.letters")}
              onChange={(e) => setUnits({ ...units, letters: e.target.value })}
            />
            <TextField
              id="layout-unit-pattern"
              label={t("unitPattern")}
              hint={t("unitPatternHint")}
              value={units.pattern}
              error={errorAt("units.pattern")}
              onChange={(e) => setUnits({ ...units, pattern: e.target.value })}
            />
          </div>
          <div className="grid gap-3.5 min-[600px]:grid-cols-3">
            <Field label={tp("unitTypeLabel")} htmlFor="layout-unitType">
              <select id="layout-unitType" className={inputClass} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
                {unitTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {pick(type.nameBn, type.nameEn, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <TextField id="layout-size" label={tp("size")} inputMode="decimal" value={sizeSqft} onChange={(e) => setSizeSqft(e.target.value)} />
            <Field label={tp("billToLabel")} htmlFor="layout-billTo">
              <select id="layout-billTo" className={inputClass} value={billTo} onChange={(e) => setBillTo(e.target.value as BillTo)}>
                {BILL_TO.map((value) => (
                  <option key={value} value={value}>
                    {tp(`billTo.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <CheckField id="layout-bangla" label={tp("bangla")} checked={bangla} onChange={(e) => setBangla(e.target.checked)} />
        </fieldset>

        {preview.length > 0 ? (
          <div className="grid gap-2 rounded-[8px] border border-line bg-surface-2 p-3">
            <p className="text-[13px] font-semibold">{localDigits(t("preview", { floors: preview.length, units: unitTotal }), locale)}</p>
            <ul className="grid max-h-56 gap-1 overflow-y-auto text-[13px]">
              {[...preview].reverse().map((floor) => (
                <li key={floor.number}>
                  <span className="font-semibold">{floor.name}</span>
                  <span className="text-muted-foreground">: {floor.units.length > 0 ? floor.units.join(", ") : t("noUnits")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <FormStatus status={status} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !parsed.success}>
            {t("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
