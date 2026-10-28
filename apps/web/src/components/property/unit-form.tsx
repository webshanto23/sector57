"use client";

import { BILL_TO, pick, type BillTo, type Locale, type UnitDetail, type UnitTypeItem } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card, Chip, Field, inputClass } from "@/components/kit";
import { OCCUPANCY_TONES } from "./occupancy";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

/** One unit's facts: name, holding number, type, size, who is billed, active. Occupancy is shown, not edited (it is derived). */
export function UnitForm({ unit, unitTypes }: { unit: UnitDetail; unitTypes: UnitTypeItem[] }) {
  const t = useTranslations("Property");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState({
    name: unit.name,
    code: unit.code ?? "",
    unitType: unit.unitType,
    sizeSqft: unit.sizeSqft ?? "",
    billTo: unit.billTo as BillTo,
    isActive: unit.isActive,
  });
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues({ ...values, [key]: value });

  return (
    <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid content-start gap-3.5">
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.PATCH("/units/{id}", { params: { path: { id: unit.id } }, body: values }));
          }}
        >
          <fieldset disabled={!unit.can.edit} className="grid gap-3.5">
            <div className="grid gap-3.5 min-[600px]:grid-cols-2">
              <TextField id="unit-name" label={t("name")} value={values.name} onChange={(e) => set("name", e.target.value)} required />
              <TextField id="unit-code" label={t("code")} hint={t("codeHint")} value={values.code} onChange={(e) => set("code", e.target.value)} />
              <Field label={t("unitTypeLabel")} htmlFor="unit-type">
                <select id="unit-type" className={inputClass} value={values.unitType} onChange={(e) => set("unitType", e.target.value)}>
                  {unitTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {pick(type.nameBn, type.nameEn, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <TextField
                id="unit-size"
                label={t("size")}
                hint={t("sizeHint")}
                inputMode="decimal"
                value={values.sizeSqft}
                onChange={(e) => set("sizeSqft", e.target.value)}
              />
              <Field label={t("billToLabel")} htmlFor="unit-billTo">
                <select id="unit-billTo" className={inputClass} value={values.billTo} onChange={(e) => set("billTo", e.target.value as BillTo)}>
                  {BILL_TO.map((value) => (
                    <option key={value} value={value}>
                      {t(`billTo.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-[5px]">
                <span className="text-[13px] font-semibold">{t("occupancyLabel")}</span>
                <span>
                  <Chip tone={OCCUPANCY_TONES[unit.occupancy]}>{t(`occupancy.${unit.occupancy}`)}</Chip>
                </span>
                <p className="text-[12.5px] text-muted-foreground">{t("occupancyHint")}</p>
              </div>
            </div>
            <CheckField
              id="unit-active"
              label={t("active")}
              hint={t("activeHint")}
              checked={values.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
          </fieldset>
          <FormStatus status={status} />
          {unit.can.edit ? (
            <Button type="submit" disabled={busy || !values.name.trim()} className="justify-self-start">
              {t("save")}
            </Button>
          ) : null}
        </form>
      </Card>

      {unit.can.delete ? (
        <Card className="grid content-start gap-2">
          <p className="text-[12.5px] text-muted-foreground">{t("deleteHint")}</p>
          <div>
            <ConfirmButton
              label={t("delete")}
              question={t("confirmDelete", { name: unit.name })}
              icon={Trash2}
              destructive
              onConfirm={async () => {
                const done = await run(() => api.DELETE("/units/{id}", { params: { path: { id: unit.id } } }));
                if (done !== undefined) router.push(`/dashboard/property/${unit.parentId}`);
              }}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
