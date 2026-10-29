"use client";

import { amountInWords, billDensity, formatDate, formatTaka, localDigits, notePoints, pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { cn } from "cn";
import { Scissors } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Kantha } from "@/components/kit";
import { Stamp } from "@/components/print/document-head";
import { Logo } from "@/components/site/logo";
import { periodLabel } from "./labels";

/** Small green capitals over a block (mockup "BILLED TO", "PAYMENT"). */
const Caption = ({ children }: { children: ReactNode }) => <p className="text-[8pt] font-semibold tracking-[0.12em] text-primary uppercase">{children}</p>;
const Box = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("rounded-[6px] border border-line px-[5mm] py-[3.5mm]", className)}>{children}</div>
);

/**
 * The bill on a full A4 page (mock `docs/mocks/sector57-bill-a4-8rows.png`): a green band
 * to the edges, who and what, the lines, the total payable in a solid box, how to pay, the
 * office's notes, three signatures and a counterfoil for the office. Always one page: above
 * ten lines the rows tighten and payment and notes share a box. Payable is this bill's own
 * due; the unit's other unpaid bills are only noted.
 */
export function BillA4Sheet({ invoice }: { invoice: InvoiceDetail }) {
  const t = useTranslations("Billing.printA4");
  const tPrint = useTranslations("Billing.print");
  const tBilling = useTranslations("Billing");
  const tStatus = useTranslations("Billing.status");
  const locale = useLocale() as Locale;
  const { billTo, header } = invoice;
  const compact = billDensity(invoice.lines.length) === "compact";
  const unit = billTo.unit ? [billTo.unit.name, ...[...billTo.unit.address].reverse()].join(", ") : null;
  const period = periodLabel(invoice, locale, tBilling as unknown as (key: string, values?: Record<string, string>) => string);
  const address = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;
  const hours = locale === "en" ? (header.officeHoursEn ?? header.officeHoursBn) : header.officeHoursBn;
  const contacts = [header.phone, header.email, header.regNo ? t("regNo", { no: header.regNo }) : null].filter(Boolean).join(" · ");
  const saved = notePoints(locale === "en" ? (invoice.print.noteEn ?? invoice.print.noteBn) : invoice.print.noteBn);
  const notes = saved.length ? saved : [t("note1"), t("note2")];
  const voided = invoice.status === "void";
  const statusKey = invoice.overdue ? "overdue" : invoice.status;
  const name = pick(billTo.name, billTo.nameEn, locale);
  const row = compact ? "py-[1.2mm]" : "py-[2.6mm]";

  const facts = (rows: [string, ReactNode][]) => (
    <dl className="mt-[2mm] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[6mm] gap-y-[1.2mm]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );

  const payment = (
    <>
      <Caption>{t("payment")}</Caption>
      <p className="mt-[2mm]">
        <span className="text-muted-foreground">{t("payBy")}</span> <b className="num text-[13pt]">{formatDate(invoice.dueDate, locale)}</b>
      </p>
      <p className="mt-[1mm]">
        {t("payAt")} {hours ? t("hours", { hours }) : null} {t("payKeep")}
      </p>
    </>
  );
  const noteList = (
    <>
      <Caption>{t("notes")}</Caption>
      <ul className="mt-[2mm] list-disc pl-[5mm]">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="print-bill-a4 relative flex h-[296mm] w-[210mm] flex-col overflow-hidden text-[10.5pt] leading-snug">
      <header className="flex items-start justify-between gap-[6mm] bg-accent px-[13mm] pt-[11mm] pb-[7mm] text-primary">
        <div className="flex min-w-0 items-center gap-[5mm]">
          <Logo mark={header.mark} size="lg" />
          <div className="min-w-0">
            <p className="text-[17pt] leading-tight font-bold">{pick(header.nameBn, header.nameEn, locale)}</p>
            {address ? <p className="mt-[1mm] text-[10pt]">{address}</p> : null}
            {contacts ? <p className="num text-[10pt]">{contacts}</p> : null}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-[2mm]">
          <p className="text-[24pt] leading-none font-extrabold tracking-[0.12em] uppercase">{tPrint("title")}</p>
          <p className="font-mono text-[11pt] text-foreground">{invoice.invoiceNo}</p>
          <span
            className={cn(
              "rounded-[4px] border-[1.5px] px-[3mm] py-[0.6mm] text-[9pt] font-bold tracking-[0.12em] uppercase",
              statusKey === "paid" ? "border-primary text-primary" : statusKey === "void" ? "border-muted-foreground text-muted-foreground" : "border-bad text-bad",
            )}
          >
            {tStatus(statusKey)}
          </span>
        </div>
      </header>
      <Kantha />

      <div className="flex flex-1 flex-col gap-[4mm] px-[13mm] pt-[6mm] pb-[5mm]">
        <div className="grid grid-cols-[1.25fr_1fr] gap-[5mm]">
          <Box>
            <Caption>{t("billedTo")}</Caption>
            <p className="mt-[1.5mm] text-[13pt] font-semibold">{name}</p>
            {facts([
              ...(billTo.membershipCode ? [[t("memberNo"), <span key="m" className="num font-mono">{billTo.membershipCode}</span>] as [string, ReactNode]] : []),
              ...(unit ? [[tPrint("unit"), unit] as [string, ReactNode]] : []),
              ...(billTo.phone ? [[t("phone"), <span key="p" className="num">{billTo.phone}</span>] as [string, ReactNode]] : []),
            ])}
          </Box>
          <Box>
            <Caption>{t("details")}</Caption>
            {facts([
              [tPrint("no"), <span key="n" className="font-mono">{invoice.invoiceNo}</span>],
              [tPrint("date"), <span key="d" className="num">{formatDate(invoice.issueDate, locale)}</span>],
              ...(period ? [[t("period"), period] as [string, ReactNode]] : []),
              [t("dueDate"), <span key="u" className="num">{formatDate(invoice.dueDate, locale)}</span>],
            ])}
          </Box>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-accent text-left text-[8.5pt] font-semibold tracking-[0.1em] text-primary uppercase">
              <th className="w-[12mm] px-[3mm] py-[2.5mm]">{t("line")}</th>
              <th className="py-[2.5mm]">{t("description")}</th>
              <th className="px-[3mm] py-[2.5mm] text-right">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={line.id} className="border-b border-line">
                <td className={cn("num px-[3mm]", row)}>{localDigits(String(index + 1), locale)}</td>
                <td className={row}>{pick(line.description, line.descriptionEn, locale)}</td>
                <td className={cn("num px-[3mm] text-right", row)}>{formatTaka(line.amount, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_76mm] items-end gap-[6mm]">
          <div>
            {invoice.otherDue.bills > 0 && !voided ? (
              <p className="num mb-[3mm] rounded-[4px] border border-line px-[3mm] py-[1.5mm] text-[9.5pt]">
                {t("otherDue", { count: localDigits(String(invoice.otherDue.bills), locale), amount: formatTaka(invoice.otherDue.owed, locale) })}
              </p>
            ) : null}
            <Caption>{t("inWords")}</Caption>
            <p className="mt-[1.5mm] text-[11.5pt] font-semibold">{amountInWords(invoice.due, locale)}</p>
          </div>
          <div className="num grid gap-[1.5mm]">
            <p className="flex justify-between px-[4mm] text-muted-foreground">
              <span>{t("subtotal")}</span>
              <span className="text-foreground">{formatTaka(invoice.total, locale)}</span>
            </p>
            {invoice.paid !== "0.00" && !voided ? (
              <p className="flex justify-between px-[4mm] text-muted-foreground">
                <span>{t("paid")}</span>
                <span className="text-foreground">− {formatTaka(invoice.paid, locale)}</span>
              </p>
            ) : null}
            <p className="mt-[1mm] flex items-center justify-between rounded-[6px] bg-primary px-[4mm] py-[3.5mm] text-surface">
              <span className="text-[10pt] font-semibold tracking-[0.06em] uppercase">{t("payable")}</span>
              <b className="text-[17pt]">{formatTaka(invoice.due, locale)}</b>
            </p>
          </div>
        </div>

        {compact ? (
          <Box className="grid grid-cols-2 gap-[6mm]">
            <div>{payment}</div>
            <div>{noteList}</div>
          </Box>
        ) : (
          <div className="grid grid-cols-2 gap-[5mm]">
            <Box>{payment}</Box>
            <Box>{noteList}</Box>
          </div>
        )}

        <div className="mt-auto grid grid-cols-3 gap-[10mm] pt-[8mm] text-center text-[9.5pt] text-muted-foreground">
          {[t("preparedBy"), t("treasurer"), t("signatory")].map((label) => (
            <p key={label} className="border-t border-muted-foreground pt-[1.5mm]">
              {label}
            </p>
          ))}
        </div>

        <div className="flex items-center gap-[3mm] text-[8.5pt] tracking-[0.1em] text-bad uppercase">
          <span className="flex-1 border-t border-dashed border-bad" />
          <Scissors className="size-[3.5mm]" aria-hidden />
          {t("tear")}
          <span className="flex-1 border-t border-dashed border-bad" />
        </div>
        <div className="grid grid-cols-[1fr_1.2fr_1fr_50mm] items-center gap-[5mm]">
          {[
            [t("billNo"), <span key="n" className="font-mono">{invoice.invoiceNo}</span>],
            [t("payerUnit"), [name, billTo.unit?.name].filter(Boolean).join(" · ")],
            [t("counterAmount"), <span key="a" className="num">{formatTaka(invoice.due, locale)}</span>],
          ].map(([label, value], index) => (
            <div key={index} className="min-w-0">
              <p className="text-[8pt] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
              <p className="truncate text-[11.5pt] font-semibold">{value}</p>
            </div>
          ))}
          <p className="grid h-[22mm] place-items-center rounded-[6px] border-[1.5px] border-dashed border-primary text-[8.5pt] tracking-[0.1em] text-primary/70 uppercase">
            {t("stamp")}
          </p>
        </div>

        <p className="num flex justify-between border-t border-line pt-[2mm] text-[8.5pt] text-muted-foreground">
          <span>{t("generated", { at: formatDate(new Date(), locale, "stamp") })}</span>
          <span>{t("page")}</span>
        </p>
      </div>
      {voided ? <Stamp text={tPrint("void")} tone="bad" /> : null}
    </div>
  );
}
