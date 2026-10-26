"use client";

import { amountInWords, formatDate, formatTaka, pick, type ExpenseDetail, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PrintSheet } from "@/components/print/print-sheet";
import { paidFrom } from "@/components/finance/method-text";
import { DocumentHead, Stamp } from "@/components/print/document-head";
import { Button } from "@/components/ui/button";

/**
 * The payment voucher on A5: what was paid, to whom, from which fund and account, in words,
 * with lines for who prepared, approved and received it. Only for a paid (or later voided)
 * expense; a void one prints "Void".
 */
export function VoucherPrint({ expense }: { expense: ExpenseDetail }) {
  const t = useTranslations("Expenses.print");
  const tAccount = useTranslations("Finance.funds");
  const tMethod = useTranslations("Finance.method");
  const locale = useLocale() as Locale;
  if (!expense.paid || !expense.voucherNo) return null;

  const rows: [string, string][] = [
    ...(expense.title ? [[t("titleRow"), expense.title] as [string, string]] : []),
    [t("fund"), `${pick(expense.fund.nameBn, expense.fund.nameEn, locale)} · ${paidFrom(tAccount(expense.paid.account), tMethod(expense.paid.method), expense.paid.methodRef, expense.paid.method === "cash")}`],
    [t("spentOn"), formatDate(expense.spentOn, locale)],
  ];

  return (
    <>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("button")}
      </Button>
      <PrintSheet>
        <div className="print-break-avoid relative overflow-hidden rounded-[8px] border border-line">
          <DocumentHead header={expense.header} locale={locale} title={t("title")} />
          <div className="grid gap-2.5 px-4 py-3.5 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t("no")} <b className="font-mono">{expense.voucherNo}</b>
              </span>
              <span className="num">{formatDate(expense.paid.at, locale)}</span>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">{t("description")}</th>
                  <th className="py-1 pr-2 font-normal">{t("head")}</th>
                  <th className="py-1 pr-2 font-normal">{t("paidTo")}</th>
                  <th className="py-1 text-right font-normal">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {expense.lines.map((line) => (
                  <tr key={line.id} className="border-b border-dashed border-line align-top">
                    <td className="py-1 pr-2">{line.description}</td>
                    <td className="py-1 pr-2">{pick(line.head.nameBn, line.head.nameEn, locale)}</td>
                    <td className="py-1 pr-2">{line.vendor ? [line.vendor.name, line.vendor.phone].filter(Boolean).join(" · ") : "—"}</td>
                    <td className="num py-1 text-right whitespace-nowrap">{formatTaka(line.amount, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-y border-dashed border-line py-2 font-semibold">
              <span className="min-w-0">{t("words", { words: amountInWords(expense.amount, locale) })}</span>
              <span className="num text-lg whitespace-nowrap">{formatTaka(expense.amount, locale)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-8 text-center text-[11.5px] text-muted-foreground">
              <span className="border-t border-line pt-1">
                {t("prepared")}
                {expense.requestedBy ? <span className="block">{expense.requestedBy.name}</span> : null}
              </span>
              <span className="border-t border-line pt-1">
                {t("approvedBy")}
                {expense.approved?.by ? <span className="block">{expense.approved.by}</span> : null}
              </span>
              <span className="border-t border-line pt-1">{t("received")}</span>
            </div>
          </div>
          {expense.status === "void" ? <Stamp text={t("void")} tone="bad" /> : null}
        </div>
      </PrintSheet>
    </>
  );
}
