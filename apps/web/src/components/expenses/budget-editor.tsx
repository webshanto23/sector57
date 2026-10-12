"use client";

import { formatTaka, moneyOrZeroSchema, pick, type Budget, type Locale } from "@s57/shared";
import { Pencil, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Card, inputClass, ProgressBar } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * The year's budget per expense head: budget, approved but unpaid, paid, what is left and a
 * bar, overspent heads marked. With `budgets.edit` the amounts become inputs (blank or zero
 * clears a head's budget). Going over only warns.
 */
export function BudgetEditor({ budget }: { budget: Budget }) {
  const t = useTranslations("Expenses.budget");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(budget.lines.map((line) => [line.head.id, line.budget ?? ""])));
  const invalid = Object.values(amounts).some((value) => value.trim() !== "" && !moneyOrZeroSchema.safeParse(value).success);
  const money = (value: string) => formatTaka(value, locale);

  async function save() {
    const lines = budget.lines.map((line) => ({ headId: line.head.id, amount: amounts[line.head.id]?.trim() || "0" }));
    const saved = await run(() => api.PUT("/budgets", { body: { year: budget.year, lines } }), t("saved"));
    if (saved) setEditing(false);
  }

  if (budget.lines.length === 0) return <Card className="text-muted-foreground">{t("noHeads")}</Card>;

  return (
    <div className="grid gap-3">
      {budget.can.edit ? (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button type="button" disabled={busy || invalid} onClick={() => void save()}>
                <Save aria-hidden />
                {busy ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {t("edit")}
            </Button>
          )}
        </div>
      ) : null}
      <FormStatus status={status} />

      <ul className="grid gap-2.5">
        {budget.lines.map((line) => (
          <li key={line.head.id}>
            <Card className={`grid gap-2 ${line.head.archived ? "opacity-75" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{pick(line.head.nameBn, line.head.nameEn, locale)}</span>
                {editing ? (
                  <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    {t("budget")}
                    <input
                      inputMode="decimal"
                      className={`${inputClass} num w-36`}
                      value={amounts[line.head.id] ?? ""}
                      aria-invalid={(amounts[line.head.id]?.trim() && !moneyOrZeroSchema.safeParse(amounts[line.head.id]).success) || undefined}
                      onChange={(e) => setAmounts({ ...amounts, [line.head.id]: e.target.value })}
                    />
                  </label>
                ) : (
                  <span className="num text-[14px] font-semibold">{line.budget ? money(line.budget) : <span className="font-normal text-muted-foreground">{t("notSet")}</span>}</span>
                )}
              </div>
              {line.percent !== null ? <ProgressBar value={line.percent} tone={line.over ? "bad" : line.percent >= 80 ? "warn" : "good"} label={t("used")} /> : null}
              <div className="num flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
                <span>{t("paid", { amount: money(line.paid) })}</span>
                <span>{t("approved", { amount: money(line.approved) })}</span>
                {line.remaining !== null ? (
                  <span className={line.over ? "font-semibold text-bad" : ""}>
                    {line.over ? t("over", { amount: money(line.remaining.replace(/^-/, "")) }) : t("remaining", { amount: money(line.remaining) })}
                  </span>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
