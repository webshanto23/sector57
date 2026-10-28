"use client";

import { localDigits, pick, type BuildingGrid as Grid, type Locale, type UnitTypeItem } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Chip, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { OCCUPANCY_TONES } from "./occupancy";
import { unitTypeName } from "./unit-types";
import { useSubmit } from "./use-submit";

/**
 * A building at a glance: one row per floor with its units. Editors tick units (or a whole
 * floor) and give them one type, such as shops on the ground floor.
 */
export function BuildingGrid({ grid, unitTypes, unitsOpen }: { grid: Grid; unitTypes: UnitTypeItem[]; unitsOpen: boolean }) {
  const t = useTranslations("Property.grid");
  const tOcc = useTranslations("Property.occupancy");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [unitType, setUnitType] = useState(unitTypes[0]?.code ?? "");

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(chosen);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setChosen(next);
  };

  async function apply() {
    const done = await run(
      () => api.POST("/units/bulk-type", { body: { unitIds: [...chosen], unitType } }),
      localDigits(t("done", { count: chosen.size }), locale),
    );
    if (done !== undefined) setChosen(new Set());
  }

  return (
    <Card className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="font-semibold">{t("title")}</h3>
        {grid.canEdit ? <p className="text-[13px] text-muted-foreground">{t("hint")}</p> : null}
      </div>

      <ol className="grid gap-2">
        {[...grid.floors].reverse().map((floor) => {
          const ids = floor.units.map((unit) => unit.id);
          const all = ids.length > 0 && ids.every((id) => chosen.has(id));
          return (
            <li key={floor.id} className="grid gap-2 rounded-[10px] border border-line p-2.5 min-[700px]:grid-cols-[150px_1fr] min-[700px]:items-start">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                {grid.canEdit && ids.length > 0 ? (
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={t("pickFloor", { name: floor.name })}
                    checked={all}
                    onChange={(e) => toggle(ids, e.target.checked)}
                  />
                ) : null}
                {floor.name}
              </div>
              {floor.units.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{t("noUnits")}</p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {floor.units.map((unit) => (
                    <li key={unit.id}>
                      <label
                        className={`grid gap-1 rounded-[8px] border p-2 text-[13px] ${chosen.has(unit.id) ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {grid.canEdit ? (
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={chosen.has(unit.id)}
                              onChange={(e) => toggle([unit.id], e.target.checked)}
                            />
                          ) : null}
                          {unitsOpen ? (
                            <Link href={`/dashboard/units/${unit.id}`} className="underline-offset-2 hover:underline">
                              {unit.name}
                            </Link>
                          ) : (
                            unit.name
                          )}
                        </span>
                        <span className="text-muted-foreground">{unitTypeName(unitTypes, unit.unitType, locale)}</span>
                        <span className="flex flex-wrap gap-1">
                          <Chip tone={OCCUPANCY_TONES[unit.occupancy]}>{tOcc(unit.occupancy)}</Chip>
                          {unit.alsoOn.length > 0 ? <Chip tone="info">{t("alsoOn", { names: unit.alsoOn.join(", ") })}</Chip> : null}
                          {!unit.isActive ? <Chip tone="warn">{t("inactive")}</Chip> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {grid.canEdit ? (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface p-2.5">
          <span className="text-[13.5px] font-semibold">{localDigits(t("chosen", { count: chosen.size }), locale)}</span>
          <select aria-label={t("typeLabel")} className={`${inputClass} sm:w-auto!`} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
            {unitTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {pick(type.nameBn, type.nameEn, locale)}
              </option>
            ))}
          </select>
          <Button type="button" disabled={busy || chosen.size === 0} onClick={() => void apply()}>
            {t("apply")}
          </Button>
          {chosen.size > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setChosen(new Set())}>
              {t("clear")}
            </Button>
          ) : null}
          <FormStatus status={status} />
        </div>
      ) : null}
    </Card>
  );
}
