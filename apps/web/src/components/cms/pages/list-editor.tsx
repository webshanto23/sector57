"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A repeating group of fields (stats, events, contacts, projects): each row with
 * move up, move down and remove, and an add button while under `max`.
 */
export function ListEditor({
  title,
  items,
  max,
  onAdd,
  onRemove,
  onMove,
  row,
  rowLabel,
}: {
  title: string;
  /** The rows' stable ids (useFieldArray's `fields`). */
  items: { id: string }[];
  max: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  row: (index: number) => ReactNode;
  /** Accessible name of row `index` for its buttons, e.g. "Stat 2". */
  rowLabel: (index: number) => string;
}) {
  const t = useTranslations("Cms.list");
  const count = items.length;
  return (
    <section className="grid gap-2.5" aria-label={title}>
      <h3 className="text-[13.5px] font-semibold">{title}</h3>
      {count === 0 ? <p className="text-[13px] text-muted-foreground">{t("empty")}</p> : null}
      <ol className="grid gap-2.5">
        {items.map((item, index) => (
          <li key={item.id} className="grid gap-2.5 rounded-[8px] border border-line bg-surface-2 p-3">
            {row(index)}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
                aria-label={t("moveUp", { item: rowLabel(index) })}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === count - 1}
                onClick={() => onMove(index, index + 1)}
                aria-label={t("moveDown", { item: rowLabel(index) })}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
                <Trash2 aria-hidden />
                {t("remove")}
                <span className="sr-only">{rowLabel(index)}</span>
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {count < max ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={onAdd}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("max", { max })}</p>
      )}
    </section>
  );
}
