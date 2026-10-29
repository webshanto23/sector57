"use client";

import { formatDate, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Kantha } from "@/components/kit";
import { PrintSheet } from "@/components/print/print-sheet";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";

const PAGE = "\u0001";
const PAGES = "\u0002";

/** The named print pages (globals.css) a report can use. */
export type ReportPage = "a4" | "a4-landscape";

/**
 * The page footer, "Printed 27 Oct 2026 · Page 1 of 2", in the bottom margin of every page of
 * `page`. Only CSS can count pages, so the words go into a page rule here.
 */
function footerRule(page: ReportPage, text: string, locale: Locale): string {
  const style = locale === "bn" ? "bengali" : "decimal";
  const parts = text.split(/(\u0001|\u0002)/).map((part) =>
    part === PAGE ? `counter(page, ${style})` : part === PAGES ? `counter(pages, ${style})` : JSON.stringify(part),
  );
  return `@media print { @page ${page} { @bottom-left { content: ${parts.join(" ")}; } } }`;
}

/**
 * A report on A4 with its "Print A4" button: the society's band (badge, name, place line), the
 * title and what is shown on the right, the body (`children`), the signature lines and the page
 * footer. The band's words come from the database, never from code.
 */
export function ReportPrint({
  page,
  band,
  title,
  sub,
  signatures,
  children,
}: {
  page: ReportPage;
  band: { name: string; mark: string; place: string | null };
  title: string;
  sub: string;
  signatures: string[];
  children: ReactNode;
}) {
  const t = useTranslations("Reports.print");
  const locale = useLocale() as Locale;
  const footer = `${t("printed", { date: formatDate(new Date(), locale, "short") })} · ${t("page", { page: PAGE, pages: PAGES })}`;

  return (
    <>
      <Button type="button" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("button")}
      </Button>
      <PrintSheet>
        <style>{footerRule(page, footer, locale)}</style>
        <div className={page === "a4" ? "print-a4" : "print-a4-landscape"}>
          <header className="flex items-center justify-between gap-[6mm] bg-accent px-[5mm] py-[4mm] text-primary">
            <div className="flex items-center gap-[3mm]">
              <Logo mark={band.mark} size="lg" />
              <div>
                <p className="text-[15pt] leading-tight font-bold">{band.name}</p>
                {band.place ? <p className="mt-[1mm] text-[9.5pt]">{band.place}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[14pt] font-bold tracking-[0.08em] uppercase">{title}</p>
              <p className="mt-[1mm] text-[9.5pt] text-muted-foreground">{sub}</p>
            </div>
          </header>
          <Kantha className="mb-[4mm]" />
          {children}
          <div
            className={`print-break-avoid mt-[16mm] ml-auto grid gap-[10mm] text-center text-[9pt] text-muted-foreground ${page === "a4" ? "w-full" : "w-[60%]"}`}
            style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}
          >
            {signatures.map((who) => (
              <p key={who} className="border-t border-muted-foreground pt-[1.5mm]">
                {who}
              </p>
            ))}
          </div>
        </div>
      </PrintSheet>
    </>
  );
}

export type PrintCell = { text: ReactNode; numeric?: boolean };
export type PrintRow = { key: string; void?: boolean; cells: PrintCell[] };

/**
 * One titled table of a report's print. `total` is shown beside the title; `foot` rows are bold
 * below the line (totals); a voided row is struck through. No rows: "None".
 */
export function PrintSection({
  title,
  total,
  headers,
  rows,
  foot = [],
}: {
  title: string;
  total?: string | null;
  headers: PrintCell[];
  rows: PrintRow[];
  foot?: PrintRow[];
}) {
  const t = useTranslations("Reports.print");
  const cell = (item: PrintCell, i: number) => (
    <td key={i} className={`py-[1mm] pr-[2mm] align-top ${item.numeric ? "num text-right whitespace-nowrap" : ""}`}>
      {item.text}
    </td>
  );
  return (
    <section className="mt-[5mm]">
      <div className="print-break-avoid mb-[1.5mm] flex items-baseline justify-between gap-[4mm]">
        <h2 className="text-[11.5pt] font-bold">{title}</h2>
        {total ? <span className="num text-[9.5pt]">{total}</span> : null}
      </div>
      {rows.length ? (
        <table className="w-full border-collapse text-left text-[9pt]">
          <thead>
            <tr className="border-b border-line">
              {headers.map((head, i) => (
                <th key={i} className={`py-[1mm] pr-[2mm] font-semibold ${head.numeric ? "text-right" : ""}`}>
                  {head.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b border-line ${row.void ? "text-muted-foreground line-through" : ""}`}>
                {row.cells.map(cell)}
              </tr>
            ))}
          </tbody>
          {foot.length ? (
            <tfoot className="font-bold">
              {foot.map((row) => (
                <tr key={row.key} className="border-b border-line">
                  {row.cells.map(cell)}
                </tr>
              ))}
            </tfoot>
          ) : null}
        </table>
      ) : (
        <p className="text-[9.5pt] text-muted-foreground">{t("none")}</p>
      )}
    </section>
  );
}
