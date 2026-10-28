"use client";

import type { UnitDetail } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Chip } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

/**
 * The other storeys a unit covers (a duplex, an office over several floors). Editors tick
 * them from the storeys beside the unit's own; others see the list. Hidden when there is
 * nothing to show.
 */
export function UnitStoreysCard({ unit }: { unit: UnitDetail }) {
  const t = useTranslations("Property.storeys");
  const { status, busy, run } = useSubmit();
  const [chosen, setChosen] = useState(() => new Set(unit.covers.map((storey) => storey.id)));

  const editable = unit.can.edit && unit.coverOptions.length > 0;
  if (!editable && unit.covers.length === 0) return null;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };

  return (
    <Card className="grid gap-3">
      <div className="grid gap-0.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </div>
      {editable ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.PUT("/units/{id}/storeys", { params: { path: { id: unit.id } }, body: { storeyIds: [...chosen] } }));
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{t("title")}</legend>
            {/* Linked storeys outside the caller's area stay as they are. */}
            {unit.covers
              .filter((storey) => !unit.coverOptions.some((option) => option.id === storey.id))
              .map((storey) => (
                <Chip key={storey.id} plain>
                  {storey.name}
                </Chip>
              ))}
            {unit.coverOptions.map((storey) => (
              <label key={storey.id} className="inline-flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13.5px]">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={chosen.has(storey.id)}
                  onChange={(e) => toggle(storey.id, e.target.checked)}
                />
                {storey.name}
              </label>
            ))}
          </fieldset>
          <FormStatus status={status} />
          <Button type="submit" variant="outline" disabled={busy} className="justify-self-start">
            {t("save")}
          </Button>
        </form>
      ) : (
        <p className="flex flex-wrap gap-1.5">
          {unit.covers.map((storey) => (
            <Chip key={storey.id} plain>
              {storey.name}
            </Chip>
          ))}
        </p>
      )}
    </Card>
  );
}
