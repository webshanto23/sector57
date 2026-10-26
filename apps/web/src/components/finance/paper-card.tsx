"use client";

import { BILL_NOTE_MAX, PRINT_SUPPORT, type PrintChoice, type PrintDocument, type PrintFormat, type PrintFormats } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Card, Field, inputClass } from "@/components/kit";

export type Paper = { bill: PrintChoice & { noteBn: string; noteEn: string }; receipt: PrintChoice };

export const toPaper = (formats: PrintFormats): Paper => ({
  bill: { ...formats.bill, noteBn: formats.bill.noteBn ?? "", noteEn: formats.bill.noteEn ?? "" },
  receipt: formats.receipt,
});

/** One document's papers: a tick for each one offered, and which prints unless someone picks. */
function PaperChoice<T extends PrintChoice>({
  document,
  value,
  onChange,
  disabled,
}: {
  document: PrintDocument;
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
}) {
  const t = useTranslations("Finance.settings");
  const tPrint = useTranslations("Print");
  const supported: readonly PrintFormat[] = PRINT_SUPPORT[document];

  function toggle(format: PrintFormat, on: boolean) {
    const offered = supported.filter((known) => (known === format ? on : value.offered.includes(known)));
    // Never offer nothing, and keep the default among what is offered.
    if (offered.length === 0) return;
    onChange({ ...value, offered, default: offered.includes(value.default) ? value.default : offered[0]! });
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-[13px] font-medium">{t(document === "bill" ? "paperBills" : "paperReceipts")}</legend>
      {supported.map((format) => (
        <div key={format} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
          <label className="flex min-w-36 items-center gap-2">
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
              name={`${document}-paper-default`}
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
  );
}

/**
 * Settings card "Paper": which papers bills and receipts may print on (untick a paper nobody
 * has a printer for), which one prints unless someone picks, and the bill's notes, one point
 * per line. Part of the settings form, which saves it.
 */
export function PaperCard({ value, onChange, disabled }: { value: Paper; onChange: (next: Paper) => void; disabled: boolean }) {
  const t = useTranslations("Finance.settings");

  const note = (key: "noteBn" | "noteEn", label: string, lang?: string) => (
    <Field label={label} htmlFor={`bill-${key}`}>
      <textarea
        id={`bill-${key}`}
        className={`${inputClass} min-h-24`}
        value={value.bill[key]}
        maxLength={BILL_NOTE_MAX}
        lang={lang}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, bill: { ...value.bill, [key]: e.target.value } })}
      />
    </Field>
  );

  return (
    <Card className="grid gap-3.5">
      <div>
        <h2 className="text-[15px]">{t("billPaper")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("billPaperHint")}</p>
      </div>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <PaperChoice document="bill" value={value.bill} onChange={(bill) => onChange({ ...value, bill })} disabled={disabled} />
        <PaperChoice document="receipt" value={value.receipt} onChange={(receipt) => onChange({ ...value, receipt })} disabled={disabled} />
      </div>
      <div className="grid gap-3 min-[700px]:grid-cols-2">
        {note("noteBn", t("billNoteBn"))}
        {note("noteEn", t("billNoteEn"), "en")}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("billNoteHint")}</p>
    </Card>
  );
}
