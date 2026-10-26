"use client";

import { formatDate, formatNumber, formatTaka, pick, type BillAheadPreview, type Locale } from "@s57/shared";
import { CalendarPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { errorMessageKey } from "@/components/admin/errors";
import { Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * "Bill ahead" on a unit page, for someone paying months in advance: pick a month, see the
 * lines its recurring charges would make, then make them. No credit is kept, so this is how
 * an advance is taken.
 */
export function BillAhead({ unitId, min, max }: { unitId: string; min: string; max: string }) {
  const t = useTranslations("Billing.ahead");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run } = useSubmit();
  const [month, setMonth] = useState(min);
  const [preview, setPreview] = useState<BillAheadPreview | null>(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setLoading(true);
    setStatus(null);
    try {
      const { data, error } = await api.GET("/units/{id}/bill-ahead", { params: { path: { id: unitId }, query: { month } } });
      setPreview(data ?? null);
      if (!data) setStatus({ ok: false, text: tAll(errorMessageKey(error)) });
    } finally {
      setLoading(false);
    }
  }

  async function make() {
    const made = await run(() => api.POST("/units/{id}/bill-ahead", { params: { path: { id: unitId } }, body: { month } }));
    if (made) {
      setPreview(null);
      setStatus({ ok: true, text: t("made", { numbers: made.invoices.map((invoice) => invoice.invoiceNo).join(", ") }) });
    }
  }

  return (
    <details className="rounded-[8px] border border-line p-3">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <CalendarPlus className="size-4" aria-hidden />
        {t("title")}
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("upTo")} htmlFor={`ahead-${unitId}`}>
            <input
              id={`ahead-${unitId}`}
              type="month"
              className={`${inputClass} sm:w-auto!`}
              value={month}
              min={min}
              max={max}
              onChange={(e) => {
                setMonth(e.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <Button type="button" variant="outline" disabled={loading || !month} onClick={() => void show()}>
            {t("preview")}
          </Button>
        </div>
        {preview ? (
          preview.lines.length === 0 ? (
            <p className="text-[13.5px] text-muted-foreground">{t("none")}</p>
          ) : (
            <div className="grid gap-2">
              {preview.billTo ? <p className="text-[13.5px]">{t("billTo", { name: preview.billTo })}</p> : null}
              <ul className="grid gap-1 text-[13.5px]">
                {preview.lines.map((line) => (
                  <li key={`${line.scheduleId}-${line.periodStart}`} className="flex justify-between gap-3">
                    <span>
                      {pick(line.nameBn, line.nameEn, locale)} ({formatDate(line.periodStart, locale, "monthYear")})
                    </span>
                    <span className="num">{formatTaka(line.amount, locale)}</span>
                  </li>
                ))}
              </ul>
              <p className="num font-semibold">
                {t("total", { count: formatNumber(preview.invoiceCount, locale), amount: formatTaka(preview.total, locale) })}
              </p>
              <div>
                <Button type="button" disabled={busy} onClick={() => void make()}>
                  {t("confirm")}
                </Button>
              </div>
            </div>
          )
        ) : null}
        <FormStatus status={status} />
      </div>
    </details>
  );
}
