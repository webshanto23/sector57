"use client";

import { localDigits, type Locale, type LocationLevel } from "@s57/shared";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Chip, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

type Row = { key: string; id: string | null; nameBn: string; nameEn: string; canOwn: boolean; locationCount: number };

const toRows = (levels: LocationLevel[]): Row[] =>
  levels.map((level) => ({ key: level.id, id: level.id, nameBn: level.nameBn, nameEn: level.nameEn ?? "", canOwn: level.canOwn, locationCount: level.locationCount }));

/**
 * The levels of the map, top first. The last row always holds the units. The API
 * refuses removing or reordering levels in use; the buttons only stop the obvious cases.
 */
export function LevelsEditor({ levels }: { levels: LocationLevel[] }) {
  const t = useTranslations("Property.levelsPage");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [rows, setRows] = useState(() => toRows(levels));

  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    setRows(next);
  };

  async function save() {
    const saved = await run(() =>
      api.PUT("/location-levels", { body: { levels: rows.map((row) => ({ id: row.id, nameBn: row.nameBn, nameEn: row.nameEn, canOwn: row.canOwn })) } }),
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
          const last = index === rows.length - 1;
          return (
            <li key={row.key} className="grid gap-2.5 rounded-[12px] border border-line bg-surface p-3 min-[700px]:grid-cols-[auto_1fr_1fr_auto] min-[700px]:items-center">
              <span className="num flex size-7 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">
                {localDigits(index + 1, locale)}
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
                <label className="inline-flex items-center gap-1.5 pe-1 text-[13px]">
                  <input type="checkbox" className="size-4 accent-primary" checked={row.canOwn} onChange={(e) => update(index, { canOwn: e.target.checked })} />
                  {t("canOwn")}
                </label>
                {last ? <Chip tone="acc" plain>{t("holdsUnits")}</Chip> : null}
                <Chip plain>{t("inUse", { count: row.locationCount })}</Chip>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("moveUp")} title={t("moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveDown")}
                  title={t("moveDown")}
                  disabled={last}
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
                  disabled={row.locationCount > 0 || rows.length <= 2}
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
          disabled={rows.length >= 10}
          onClick={() => setRows([...rows.slice(0, -1), { key: crypto.randomUUID(), id: null, nameBn: "", nameEn: "", canOwn: false, locationCount: 0 }, rows.at(-1)!])}
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
