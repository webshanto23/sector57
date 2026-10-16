"use client";

import { localDigits, type BillableUnits, type Locale } from "@s57/shared";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Unit = BillableUnits["items"][number];

/** A place in the address tree (block, road, building…) with the units right under it and the places below. */
export type PlaceNode = { key: string; name: string; units: Unit[]; children: PlaceNode[] };

/** Builds the place tree from the units' addresses, keeping the order they came in. */
export function placeTree(units: Unit[]): PlaceNode {
  const root: PlaceNode = { key: "", name: "", units: [], children: [] };
  for (const unit of units) {
    let node = root;
    for (const name of unit.address) {
      const key = `${node.key}/${name}`;
      let child = node.children.find((c) => c.key === key);
      if (!child) {
        child = { key, name, units: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.units.push(unit);
  }
  return root;
}

/** Every unit at or under a place. */
export function unitsUnder(node: PlaceNode): Unit[] {
  return [...node.units, ...node.children.flatMap(unitsUnder)];
}

/**
 * One place, folded by default: a chevron to open it, a tick box for every unit under it,
 * and how many are chosen. `forceOpen` (while filtering) shows everything.
 */
export function PlaceBranch({
  node,
  depth,
  expanded,
  forceOpen,
  selectable,
  isChosen,
  onExpand,
  onToggle,
  renderUnit,
}: {
  node: PlaceNode;
  depth: number;
  expanded: Set<string>;
  forceOpen: boolean;
  selectable: (unit: Unit) => boolean;
  isChosen: (unit: Unit) => boolean;
  onExpand: (key: string) => void;
  onToggle: (units: Unit[], on: boolean) => void;
  renderUnit: (unit: Unit) => ReactNode;
}) {
  const t = useTranslations("Billing.batch");
  const locale = useLocale() as Locale;
  const all = unitsUnder(node);
  const pickable = all.filter(selectable);
  const chosen = pickable.filter(isChosen).length;
  const open = forceOpen || expanded.has(node.key);
  const bodyId = `place-${node.key}`;

  return (
    <li className="grid">
      <div className="flex items-center gap-2 py-1.5" style={{ paddingInlineStart: `${depth * 14}px` }}>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-surface-2"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={node.name}
          onClick={() => onExpand(node.key)}
        >
          <ChevronRight aria-hidden className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-primary"
          checked={pickable.length > 0 && chosen === pickable.length}
          ref={(box) => {
            if (box) box.indeterminate = chosen > 0 && chosen < pickable.length;
          }}
          disabled={pickable.length === 0}
          aria-label={t("pickGroup", { place: node.name })}
          onChange={(e) => onToggle(all, e.target.checked)}
        />
        <button type="button" className="min-w-0 flex-1 truncate text-start text-[13.5px] font-semibold" onClick={() => onExpand(node.key)}>
          {node.name}
        </button>
        <span className="num shrink-0 text-[12px] text-muted-foreground">
          {chosen ? `${localDigits(chosen, locale)}/` : ""}
          {localDigits(all.length, locale)}
        </span>
      </div>
      {open ? (
        <ul id={bodyId} className="grid">
          {node.children.map((child) => (
            <PlaceBranch
              key={child.key}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              forceOpen={forceOpen}
              selectable={selectable}
              isChosen={isChosen}
              onExpand={onExpand}
              onToggle={onToggle}
              renderUnit={renderUnit}
            />
          ))}
          {node.units.map((unit) => (
            <li key={unit.id} style={{ paddingInlineStart: `${(depth + 1) * 14 + 8}px` }}>
              {renderUnit(unit)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
