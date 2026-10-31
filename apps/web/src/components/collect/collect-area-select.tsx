"use client";

import type { CollectAreas } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Field, inputClass } from "@/components/kit";
import { api } from "@/lib/api/client";

type Places = CollectAreas["children"];

/** One dropdown per level: picking a place adds a dropdown for the places under it. */
export function CollectAreaSelect({ top, onChange }: { top: Places; onChange: (areaId: string) => void }) {
  const t = useTranslations("Collect");
  const [levels, setLevels] = useState<Places[]>([top]);
  const [picked, setPicked] = useState<string[]>([]);
  // Only the newest pick may add its dropdown.
  const latest = useRef(0);

  async function pick(depth: number, id: string) {
    const ask = ++latest.current;
    const next = id ? [...picked.slice(0, depth), id] : picked.slice(0, depth);
    setPicked(next);
    setLevels(levels.slice(0, depth + 1));
    onChange(next.at(-1) ?? "");
    if (!id) return;
    const { data } = await api.GET("/collect/areas", { params: { query: { parentId: id } } });
    if (ask === latest.current && data?.children.length) setLevels([...levels.slice(0, depth + 1), data.children]);
  }

  if (top.length === 0) return null;
  return (
    <Field label={t("area")} htmlFor="collect-area-0">
      <div className="grid gap-2 min-[600px]:grid-cols-3">
        {levels.map((places, depth) => (
          <select
            key={depth === 0 ? "top" : picked[depth - 1]}
            id={`collect-area-${depth}`}
            aria-label={t("area")}
            className={inputClass}
            value={picked[depth] ?? ""}
            onChange={(e) => void pick(depth, e.target.value)}
          >
            <option value="">{depth === 0 ? t("allAreas") : t("allHere")}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    </Field>
  );
}
