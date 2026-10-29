import { amountInWords, formatDate, formatTaka, pick, type Locale } from "@s57/shared";
import { useTranslations } from "next-intl";
import { ThermalHead, ThermalRow } from "@/components/print/thermal-head";
import { ThermalRule, ThermalSheet } from "@/components/print/thermal-sheet";
import type { ReceiptData } from "./receipt";

/**
 * The receipt on an 80 mm roll, from the same `ReceiptData` as the A5 one: who paid, each
 * bill (or the donation) on two lines, the total in figures and words, how it was paid and
 * who took it. No counterfoil. "Duplicate" and "Void" print as a line of text; the line is
 * always there (blank on an original) so the roll's length doesn't change at print time.
 */
export function ReceiptThermal({ data, locale }: { data: ReceiptData; locale: Locale }) {
  const t = useTranslations("Collect.receipt");
  const tc = useTranslations("Collect");
  const tMethod = useTranslations("Finance.method");
  const payer = data.payer ? pick(data.payer.name, data.payer.nameEn, locale) : t("anonymous");
  const member = data.payer?.membershipCode ? tc("memberNo", { no: data.payer.membershipCode }) : null;
  const unit = data.unit ? [data.unit.name, ...[...data.unit.address].reverse()].join(", ") : null;
  const mark = data.mark === "void" ? t("void") : data.mark === "duplicate" ? t("duplicate") : null;

  return (
    <ThermalSheet>
      <ThermalHead header={data.header} locale={locale} title={data.kind === "donation" ? t("donationTitle") : t("title")} />
      <p className={`mt-[1mm] text-center font-bold tracking-widest uppercase ${mark ? "" : "invisible"}`}>{mark ?? "—"}</p>
      <ThermalRule />
      <ThermalRow label={t("no")} value={data.receiptNo ?? "—"} />
      <ThermalRow label="" value={formatDate(data.date, locale, data.date.length > 10 ? "stamp" : "long")} />
      <ThermalRule />
      <p>
        {t("from")}: <b>{payer}</b>
        {member ? ` · ${member}` : null}
      </p>
      {unit ? <p>{unit}</p> : null}
      <ThermalRule />
      {data.items.map((item) => (
        <div key={item.key} className="mb-[1mm]">
          <p>{item.label}</p>
          <ThermalRow
            label={
              item.invoiceNo
                ? [t("bill", { no: item.invoiceNo }), item.amount !== item.total ? t("part", { total: formatTaka(item.total, locale) }) : null].filter(Boolean).join(" · ")
                : (item.detail ?? "")
            }
            value={formatTaka(item.amount, locale)}
          />
        </div>
      ))}
      <ThermalRule />
      <ThermalRow label={t("total")} value={formatTaka(data.amount, locale)} strong />
      <p className="mt-[0.5mm]">{amountInWords(data.amount, locale)}</p>
      <ThermalRule />
      <p>{[tMethod(data.method), data.methodRef].filter(Boolean).join(" · ")}</p>
      {data.note ? <p>{t("note", { note: data.note })}</p> : null}
      <p>{t("collectedBy", { name: data.collectedBy })}</p>
      <p className="mt-[8mm] border-t border-foreground pt-[0.5mm] text-center">{t("signature")}</p>
    </ThermalSheet>
  );
}
