"use client";

import { pick, type BillingLookup, type Locale } from "@s57/shared";
import { Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Card, Chip, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

type UnitHit = BillingLookup["units"][number];

/** Finds units to add to a batch. Units already added, inactive or with nobody to bill can't be added. */
export function BatchUnitFinder({
  added,
  full,
  onAdd,
  action,
}: {
  added: Set<string>;
  full: boolean;
  onAdd: (unit: UnitHit) => void;
  /** Another way to add units, beside the title. */
  action?: ReactNode;
}) {
  const t = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UnitHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function find() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.GET("/billing/lookup", { params: { query: { q } } });
      setHits(data?.units ?? []);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("batch.find")}</h2>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          className={`${inputClass} min-w-0 flex-1`}
          value={q}
          placeholder={t("batch.findPlaceholder")}
          aria-label={t("batch.find")}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void find();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={searching} onClick={() => void find()}>
          <Search aria-hidden />
          {t("new.search")}
        </Button>
      </div>
      {hits ? (
        hits.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">{t("new.noMatch")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {hits.map((unit) => {
              const isAdded = added.has(unit.id);
              return (
                <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {unit.name}
                      {!unit.isActive ? <Chip tone="warn">{t("new.inactive")}</Chip> : null}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{unit.address.join(", ")}</p>
                    <p className="text-[13px]">
                      {unit.billTo
                        ? t("new.billsTo", { name: pick(unit.billTo.name, unit.billTo.nameEn, locale), role: t(`role.${unit.billTo.role}`) })
                        : t("new.nobody")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isAdded || full || !unit.billTo || !unit.isActive}
                    onClick={() => onAdd(unit)}
                  >
                    {isAdded ? null : <Plus aria-hidden />}
                    {isAdded ? t("batch.added") : t("batch.add")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </Card>
  );
}
