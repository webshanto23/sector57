"use client";

import {
  BILL_TO,
  expandNames,
  localDigits,
  nameRangeSchema,
  OCCUPANCIES,
  pick,
  type BillTo,
  type Locale,
  type LocationLevel,
  type Occupancy,
  type UnitTypeItem,
} from "@s57/shared";
import { ListPlus, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import type { FieldError } from "react-hook-form";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card, Chip, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

type Mode = "one" | "many";
type Kind = "location" | "unit";

const issue = (message: string): FieldError => ({ type: "custom", message });

/**
 * Adds locations or units inside a location (or at the top of the map): one at a
 * time, or many from a numbered range ("Road 1" to "Road 24", "Flat 1A" to "Flat 6D").
 * Names that already exist here are shown and left out.
 */
export function AddPanel({
  parentId,
  parentDepth,
  levels,
  unitTypes,
  canCreate,
  canCreateUnit,
  existingNames,
  heading = null,
}: {
  /** Null at the top of the map. */
  parentId: string | null;
  /** The parent's level depth, 0 at the top. */
  parentDepth: number;
  levels: LocationLevel[];
  unitTypes: UnitTypeItem[];
  canCreate: boolean;
  canCreateUnit: boolean;
  existingNames: string[];
  /** Shown beside the buttons, and on its own for those who may not add. */
  heading?: ReactNode;
}) {
  const t = useTranslations("Property");
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run } = useSubmit();

  const levelsBelow = levels.filter((level) => !level.isUnitLevel && level.depth > parentDepth);
  const kinds: Kind[] = [
    ...(canCreate && levelsBelow.length > 0 ? (["location"] as const) : []),
    ...(canCreateUnit && parentId !== null && levels.some((level) => level.isUnitLevel) ? (["unit"] as const) : []),
  ];

  const [mode, setMode] = useState<Mode | null>(null);
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "location");
  const [levelId, setLevelId] = useState(levelsBelow[0]?.id ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [range, setRange] = useState({ prefix: "", from: "1", to: "10", letters: "", bangla: locale === "bn" });
  const [unitType, setUnitType] = useState(unitTypes[0]?.code ?? "");
  const [sizeSqft, setSizeSqft] = useState("");
  const [billTo, setBillTo] = useState<BillTo>("owner");
  const [occupancy, setOccupancy] = useState<Occupancy>("vacant");

  const existing = useMemo(() => new Set(existingNames.map((n) => n.normalize("NFC"))), [existingNames]);
  const parsedRange = nameRangeSchema.safeParse(range);
  const generated = parsedRange.success ? expandNames(parsedRange.data) : [];
  const fresh = generated.filter((n) => !existing.has(n));
  const rangeError = parsedRange.success ? undefined : parsedRange.error.issues[0];

  if (kinds.length === 0) return heading;

  function open(next: Mode) {
    setStatus(null);
    setMode(next);
  }

  async function addOne() {
    if (!name.trim()) return;
    const ok =
      kind === "location"
        ? await run(() => api.POST("/locations", { body: { parentId, levelId, name, code } }))
        : await run(() =>
            api.POST("/units", {
              body: { parentId: parentId!, name, code, unitType, sizeSqft, billTo, occupancy },
            }),
          );
    if (ok !== undefined) {
      setName("");
      setCode("");
    }
  }

  async function addMany() {
    if (fresh.length === 0) return;
    const message = t("created", { count: fresh.length });
    if (kind === "location") {
      await run(() => api.POST("/locations/bulk", { body: { parentId, levelId, names: fresh } }), message);
    } else {
      await run(() => api.POST("/units/bulk", { body: { parentId: parentId!, names: fresh, unitType, sizeSqft, billTo } }), message);
    }
  }

  const unitFields = (withOccupancy: boolean) => (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <Field label={t("unitTypeLabel")} htmlFor="add-unitType">
        <select id="add-unitType" className={inputClass} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
          {unitTypes.map((type) => (
            <option key={type.code} value={type.code}>
              {pick(type.nameBn, type.nameEn, locale)}
            </option>
          ))}
        </select>
      </Field>
      <TextField
        id="add-size"
        label={t("size")}
        inputMode="decimal"
        value={sizeSqft}
        onChange={(e) => setSizeSqft(e.target.value)}
        hint={t("sizeHint")}
      />
      <Field label={t("billToLabel")} htmlFor="add-billTo">
        <select id="add-billTo" className={inputClass} value={billTo} onChange={(e) => setBillTo(e.target.value as BillTo)}>
          {BILL_TO.map((value) => (
            <option key={value} value={value}>
              {t(`billTo.${value}`)}
            </option>
          ))}
        </select>
      </Field>
      {withOccupancy ? (
        <Field label={t("occupancyLabel")} htmlFor="add-occupancy">
          <select id="add-occupancy" className={inputClass} value={occupancy} onChange={(e) => setOccupancy(e.target.value as Occupancy)}>
            {OCCUPANCIES.map((value) => (
              <option key={value} value={value}>
                {t(`occupancy.${value}`)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={mode === "one" ? "default" : "outline"} onClick={() => open("one")}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
          <Button type="button" variant={mode === "many" ? "default" : "outline"} onClick={() => open("many")}>
            <ListPlus aria-hidden />
            {t("addMany")}
          </Button>
        </div>
      </div>

      {mode ? (
        <Card className="grid gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px]">{mode === "one" ? t("add") : t("addMany")}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
              <X aria-hidden />
              {t("close")}
            </Button>
          </div>

          {kinds.length > 1 ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-[13px] font-semibold">{t("kind")}</legend>
              <div className="flex flex-wrap gap-4">
                {kinds.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-[13.5px]">
                    <input
                      type="radio"
                      name="add-kind"
                      className="size-4 accent-primary"
                      checked={kind === value}
                      onChange={() => setKind(value)}
                    />
                    {value === "location" ? t("kindLocation") : t("kindUnit")}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {kind === "location" ? (
            <Field label={t("level")} htmlFor="add-level">
              <select id="add-level" className={inputClass} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                {levelsBelow.map((level) => (
                  <option key={level.id} value={level.id}>
                    {pick(level.nameBn, level.nameEn, locale)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {mode === "one" ? (
            <form
              noValidate
              className="grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void addOne();
              }}
            >
              <div className="grid gap-3.5 min-[600px]:grid-cols-2">
                <TextField id="add-name" label={t("name")} hint={t("nameHint")} value={name} onChange={(e) => setName(e.target.value)} required />
                <TextField id="add-code" label={t("code")} hint={t("codeHint")} value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              {kind === "unit" ? unitFields(true) : null}
              <FormStatus status={status} />
              <Button type="submit" disabled={busy || !name.trim()} className="justify-self-start">
                {t("createOne")}
              </Button>
            </form>
          ) : (
            <form
              noValidate
              className="grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void addMany();
              }}
            >
              <div className="grid gap-3.5 min-[600px]:grid-cols-[2fr_1fr_1fr]">
                <TextField
                  id="add-prefix"
                  label={t("prefix")}
                  hint={t("prefixHint")}
                  value={range.prefix}
                  onChange={(e) => setRange({ ...range, prefix: e.target.value })}
                />
                <TextField
                  id="add-from"
                  label={t("from")}
                  type="number"
                  min={0}
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                />
                <TextField
                  id="add-to"
                  label={t("to")}
                  type="number"
                  min={0}
                  value={range.to}
                  error={rangeError ? issue(rangeError.message) : undefined}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                />
              </div>
              <div className="grid gap-3.5 min-[600px]:grid-cols-2 min-[600px]:items-center">
                <TextField
                  id="add-letters"
                  label={t("letters")}
                  hint={t("lettersHint")}
                  value={range.letters}
                  onChange={(e) => setRange({ ...range, letters: e.target.value })}
                />
                <CheckField
                  id="add-bangla"
                  label={t("bangla")}
                  checked={range.bangla}
                  onChange={(e) => setRange({ ...range, bangla: e.target.checked })}
                />
              </div>

              {generated.length > 0 ? (
                <div className="grid gap-2 rounded-[8px] border border-line bg-surface-2 p-3">
                  <p className="text-[13px] font-semibold">{t("preview", { count: fresh.length })}</p>
                  <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {generated.map((generatedName) => (
                      <li key={generatedName}>
                        {existing.has(generatedName) ? (
                          <Chip tone="warn" plain>
                            <s>{generatedName}</s> · {t("exists")}
                          </Chip>
                        ) : (
                          <Chip plain>{generatedName}</Chip>
                        )}
                      </li>
                    ))}
                  </ul>
                  {fresh.length < generated.length ? (
                    <p className="text-[12.5px] text-muted-foreground">{fresh.length === 0 ? t("nothingToAdd") : t("skipExisting")}</p>
                  ) : null}
                </div>
              ) : null}

              {kind === "unit" ? (
                <>
                  <h3 className="text-[13.5px]">{t("unitFacts")}</h3>
                  {unitFields(false)}
                </>
              ) : null}
              <FormStatus status={status} />
              <Button type="submit" disabled={busy || fresh.length === 0} className="justify-self-start">
                {t("createMany", { count: localDigits(fresh.length, locale) })}
              </Button>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}
