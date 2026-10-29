"use client";

import { localDigits, MAX_UNIT_TYPES, type Locale, type UnitTypeItem } from "@s57/shared";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Chip, IconBox, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { unitTypeIcon } from "./unit-types";
import { useSubmit } from "./use-submit";

type Row = { key: string; id: string | null; code: string | null; nameBn: string; nameEn: string; unitCount: number; scheduleCount: number };

const toRows = (types: UnitTypeItem[]): Row[] =>
  types.map((type) => ({
    key: type.id,
    id: type.id,
    code: type.code,
    nameBn: type.nameBn,
    nameEn: type.nameEn ?? "",
    unitCount: type.unitCount,
    scheduleCount: type.scheduleCount,
  }));

/**
 * The society's unit types in display order. The API refuses removing a type that a unit
 * or a charge schedule uses; the remove button only stops the obvious cases.
 */
export function UnitTypesEditor({ types }: { types: UnitTypeItem[] }) {
  const t = useTranslations("Property.unitTypesPage");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [rows, setRows] = useState(() => toRows(types));

  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    setRows(next);
  };

  async function save() {
    const saved = await run(() =>
      api.PUT("/unit-types", { body: { types: rows.map((row) => ({ id: row.id, nameBn: row.nameBn, nameEn: row.nameEn })) } }),
    );
    if (saved) setRows(toRows(saved.items));
  }

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ol className="grid gap-2.5">
        {rows.map((row, index) => {
          const used = row.unitCount > 0 || row.scheduleCount > 0;
          return (
            <li key={row.key} className="grid gap-2.5 rounded-[12px] border border-line bg-surface p-3 min-[700px]:grid-cols-[auto_1fr_1fr_auto] min-[700px]:items-center">
              <span className="flex items-center gap-2">
                <span className="num flex size-7 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">
                  {localDigits(index + 1, locale)}
                </span>
                <IconBox icon={unitTypeIcon(row.code)} size="sm" />
              </span>
              <input
                aria-label={t("nameBn")}
                placeholder={t("nameBn")}
                className={inputClass}
                value={row.nameBn}
                onChange={(e) => update(index, { nameBn: e.target.value })}
                required
              />
              <input
                aria-label={t("nameEn")}
                placeholder={t("nameEn")}
                lang="en"
                className={inputClass}
                value={row.nameEn}
                onChange={(e) => update(index, { nameEn: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip plain>{t("units", { count: row.unitCount })}</Chip>
                {row.scheduleCount > 0 ? <Chip plain>{t("schedules", { count: row.scheduleCount })}</Chip> : null}
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveUp")} title={t("moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveDown")}
                  title={t("moveDown")}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("remove")}
                  title={t("remove")}
                  disabled={used || rows.length <= 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= MAX_UNIT_TYPES}
          onClick={() => setRows([...rows, { key: crypto.randomUUID(), id: null, code: null, nameBn: "", nameEn: "", unitCount: 0, scheduleCount: 0 }])}
        >
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || rows.some((row) => !row.nameBn.trim())} className="justify-self-start">
        {t("save")}
      </Button>
    </form>
  );
}
