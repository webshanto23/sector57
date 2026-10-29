"use client";

import { formatDate, localDigits, type DirectoryPrint as Directory, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";

/** The directory as a door-to-door sheet on A4: one row per resident in address order, with an empty column to tick. */
export function DirectoryPrint({ list, society, today }: { list: Directory; society: string; today: string }) {
  const t = useTranslations("Directory");
  const tMembers = useTranslations("Members");
  const locale = useLocale() as Locale;

  return (
    <>
      <Button type="button" onClick={() => window.print()} disabled={list.items.length === 0}>
        <Printer aria-hidden />
        {t("printButton")}
      </Button>
      <PrintSheet>
        <div className="print-a4">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <div>
              <b className="text-[14pt]">{society}</b>
              <p className="font-semibold">{t("printTitle")}</p>
            </div>
            <div className="text-right">
              {list.area ? <p>{t("printPlace", { place: list.area.name })}</p> : null}
              <p className="num">{t("printDate", { date: formatDate(today, locale) })}</p>
            </div>
          </header>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1 pr-2">{t("col.place")}</th>
                <th className="py-1 pr-2">{t("col.name")}</th>
                <th className="py-1 pr-2">{t("col.relation")}</th>
                <th className="py-1 pr-2">{t("col.phone")}</th>
                <th className="py-1 pr-2">{t("col.member")}</th>
                <th className="w-[16%] py-1">{t("col.checked")}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((row) => (
                <tr key={row.id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2">
                    <b>{row.place.name}</b>
                    {row.place.address.length ? <span className="block text-[9pt] text-muted-foreground">{row.place.address.join(", ")}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2">{row.person.name}</td>
                  <td className="py-1.5 pr-2">
                    {tMembers(`relation.${row.relation}`)}
                    <span className="block text-[9pt]">{t(`household.${row.household}`)}</span>
                  </td>
                  <td className="num py-1.5 pr-2">{row.person.phone ? localDigits(row.person.phone, locale) : ""}</td>
                  <td className="num py-1.5 pr-2">{row.membershipCode ?? ""}</td>
                  <td className="py-1.5" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PrintSheet>
    </>
  );
}
