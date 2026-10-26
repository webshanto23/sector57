"use client";

import { BILL_NOTE_MAX, PRINT_SUPPORT, type BillPrintSettings, type PrintFormat } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Card, Field, inputClass } from "@/components/kit";

export type BillPaper = { default: PrintFormat; offered: PrintFormat[]; noteBn: string; noteEn: string };

export const toBillPaper = (bill: BillPrintSettings): BillPaper => ({
  default: bill.default,
  offered: bill.offered,
  noteBn: bill.noteBn ?? "",
  noteEn: bill.noteEn ?? "",
});

/**
 * Settings card "Bill paper": which papers bills may print on (a device without that printer
 * can then not pick it), which one prints unless someone picks, and the bill's notes, one
 * point per line. Part of the settings form, which saves it.
 */
export function BillPaperCard({ value, onChange, disabled }: { value: BillPaper; onChange: (next: BillPaper) => void; disabled: boolean }) {
  const t = useTranslations("Finance.settings");
  const tPrint = useTranslations("Print");

  const supported: readonly PrintFormat[] = PRINT_SUPPORT.bill;

  function toggle(format: PrintFormat, on: boolean) {
    const offered = supported.filter((known) => (known === format ? on : value.offered.includes(known)));
    // Never offer nothing, and keep the default among what is offered.
    if (offered.length === 0) return;
    onChange({ ...value, offered, default: offered.includes(value.default) ? value.default : offered[0]! });
  }

  const note = (key: "noteBn" | "noteEn", label: string, lang?: string) => (
    <Field label={label} htmlFor={`bill-${key}`}>
      <textarea
        id={`bill-${key}`}
        className={`${inputClass} min-h-24`}
        value={value[key]}
        maxLength={BILL_NOTE_MAX}
        lang={lang}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </Field>
  );

  return (
    <Card className="grid gap-3.5">
      <div>
        <h2 className="text-[15px]">{t("billPaper")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("billPaperHint")}</p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-medium">{t("paperOffered")}</legend>
        {supported.map((format) => (
          <div key={format} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--accent-brand)]"
                checked={value.offered.includes(format)}
                disabled={disabled}
                onChange={(e) => toggle(format, e.target.checked)}
              />
              {tPrint(`format.${format}`)}
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="radio"
                name="bill-paper-default"
                className="accent-[var(--accent-brand)]"
                checked={value.default === format}
                disabled={disabled || !value.offered.includes(format)}
                onChange={() => onChange({ ...value, default: format })}
              />
              {t("paperDefault")}
            </label>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 min-[700px]:grid-cols-2">
        {note("noteBn", t("billNoteBn"))}
        {note("noteEn", t("billNoteEn"), "en")}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("billNoteHint")}</p>
    </Card>
  );
}
