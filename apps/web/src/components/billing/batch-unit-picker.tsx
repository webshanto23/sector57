"use client";

import { Dialog } from "@base-ui/react/dialog";
import { digitVariants, localDigits, MAX_BILLABLE_UNITS, pick, type BillableUnits, type Locale } from "@s57/shared";
import { ListChecks, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Note } from "@/components/admin/form-status";
import { inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { PlaceBranch, placeTree } from "./batch-unit-tree";

export type PickedUnit = BillableUnits["items"][number];

/**
 * "Choose from list": a side panel with every unit the caller may bill as a folding tree of
 * places (block, road, building…), to tick and add to the batch at once. Units already in the batch, inactive or
 * with nobody to bill can't be ticked; at most `room` more may be chosen.
 */
export function BatchUnitPicker({ added, room, onAdd }: { added: Set<string>; room: number; onAdd: (units: PickedUnit[]) => void }) {
  const t = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BillableUnits | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setFailed(false);
    const { data } = await api.GET("/billing/units");
    if (data) setList(data);
    else setFailed(true);
  }

  const selectable = (unit: PickedUnit) => unit.isActive && unit.billTo !== null && !added.has(unit.id);
  const terms = q.trim() ? digitVariants(q.trim().toLowerCase()) : [];
  const shown = (list?.items ?? []).filter((unit) => {
    if (!terms.length) return true;
    const text = [unit.name, unit.code ?? "", unit.billTo?.name ?? "", unit.billTo?.nameEn ?? "", ...unit.address].join(" ").toLowerCase();
    return terms.some((term) => text.includes(term));
  });
  const tree = placeTree(shown);

  function expand(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function unitRow(unit: PickedUnit) {
    const inBatch = added.has(unit.id);
    return (
      <label className={`flex items-start gap-2.5 rounded-[6px] px-2 py-1.5 ${selectable(unit) ? "cursor-pointer hover:bg-surface-2" : "opacity-60"}`}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={inBatch || chosen.has(unit.id)}
          disabled={!selectable(unit)}
          onChange={(e) => toggle([unit], e.target.checked)}
        />
        <span className="grid min-w-0 text-[13.5px]">
          <span className="font-medium">
            {unit.name}
            {unit.code ? <span className="font-normal text-muted-foreground"> · {unit.code}</span> : null}
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            {inBatch
              ? t("batch.pickAdded")
              : !unit.isActive
                ? t("new.inactive")
                : unit.billTo
                  ? t("new.billsTo", { name: pick(unit.billTo.name, unit.billTo.nameEn, locale), role: t(`role.${unit.billTo.role}`) })
                  : t("new.nobody")}
          </span>
        </span>
      </label>
    );
  }

  /** Ticks (or clears) these units, never past the room left. */
  function toggle(units: PickedUnit[], on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      for (const unit of units.filter(selectable)) {
        if (!on) next.delete(unit.id);
        else if (next.size < room) next.add(unit.id);
      }
      return next;
    });
  }

  function add() {
    onAdd((list?.items ?? []).filter((unit) => chosen.has(unit.id)));
    setChosen(new Set());
    setOpen(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !list) void load();
      }}
    >
      <Dialog.Trigger render={<Button type="button" variant="outline" disabled={room <= 0} />}>
        <ListChecks aria-hidden />
        {t("batch.pickOpen")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/30 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-line bg-surface text-fg shadow-xl transition-transform data-ending-style:translate-x-full data-starting-style:translate-x-full">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="grid gap-1">
              <Dialog.Title className="text-[17px] font-semibold">{t("batch.pickTitle")}</Dialog.Title>
              <Dialog.Description className="text-[13px] text-muted-foreground">{t("batch.pickSub")}</Dialog.Description>
            </div>
            <Dialog.Close render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("batch.close")} title={t("batch.close")} />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>

          <div className="grid gap-2 border-b border-line p-4">
            <input
              type="search"
              className={inputClass}
              value={q}
              placeholder={t("batch.pickFilter")}
              aria-label={t("batch.pickFilter")}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Button type="button" variant="outline" size="sm" onClick={() => toggle(shown, true)}>
                {t("batch.pickAllShown")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={chosen.size === 0} onClick={() => setChosen(new Set())}>
                {t("batch.pickClear")}
              </Button>
              <span className="text-muted-foreground">{t("batch.pickRoom", { count: localDigits(Math.max(0, room - chosen.size), locale) })}</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {failed ? (
              <Note tone="warn">{t("batch.pickFailed")}</Note>
            ) : !list ? (
              <p className="text-[13.5px] text-muted-foreground">{t("batch.pickLoading")}</p>
            ) : shown.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">{t("batch.pickNone")}</p>
            ) : (
              <div className="grid gap-3">
                {list.truncated ? <Note tone="warn">{t("batch.pickTruncated", { max: localDigits(MAX_BILLABLE_UNITS, locale) })}</Note> : null}
                <ul className="grid">
                  {tree.children.map((node) => (
                    <PlaceBranch
                      key={node.key}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      forceOpen={terms.length > 0}
                      selectable={selectable}
                      isChosen={(unit) => chosen.has(unit.id)}
                      onExpand={expand}
                      onToggle={toggle}
                      renderUnit={unitRow}
                    />
                  ))}
                  {tree.units.map((unit) => (
                    <li key={unit.id}>{unitRow(unit)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Dialog.Close render={<Button type="button" variant="outline" />}>{t("batch.close")}</Dialog.Close>
            <Button type="button" disabled={chosen.size === 0} onClick={add}>
              {t("batch.pickAdd", { count: localDigits(chosen.size, locale) })}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
