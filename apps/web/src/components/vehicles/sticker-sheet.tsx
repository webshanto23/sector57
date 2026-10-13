"use client";

import { formatDate, pick, type Locale, type StickerSheet } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PrintSheet } from "@/components/print/print-sheet";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";

/** One sticker: the society's badge and name, the sticker and plate numbers, the unit and the last day. */
function StickerTile({ sheet, item, locale }: { sheet: StickerSheet; item: StickerSheet["items"][number]; locale: Locale }) {
  const t = useTranslations("Vehicles");
  return (
    <div className="grid content-start gap-1 rounded-[10px] border-2 border-accent p-3 text-center break-inside-avoid">
      <div className="flex items-center justify-center gap-1.5">
        <Logo mark={sheet.header.mark} />
        <b className="text-[10pt] leading-tight">{pick(sheet.header.nameBn, sheet.header.nameEn, locale)}</b>
      </div>
      <p className="num text-[20pt] leading-tight font-extrabold">{item.stickerNo}</p>
      <p className="num text-[12pt] font-semibold">{item.regNo}</p>
      <p className="text-[9pt]">
        {t(`kind.${item.kind}`)} · {[...item.place.address, item.place.name].join(", ")}
      </p>
      <p className="num text-[9pt] font-semibold">{t("validUntil", { date: formatDate(item.validUntil, locale) })}</p>
    </div>
  );
}

/** The print button, a preview on screen, and the stickers three to a row on A4. */
export function StickerSheetPrint({ sheet }: { sheet: StickerSheet }) {
  const t = useTranslations("Vehicles");
  const locale = useLocale() as Locale;
  const tiles = (
    <div className="grid grid-cols-3 gap-3">
      {sheet.items.map((item) => (
        <StickerTile key={item.stickerNo} sheet={sheet} item={item} locale={locale} />
      ))}
    </div>
  );

  return (
    <>
      <Button type="button" onClick={() => window.print()} disabled={sheet.items.length === 0} className="justify-self-start">
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <div className="overflow-x-auto rounded-[12px] border border-line bg-surface p-3">
        <div className="min-w-[640px]">{tiles}</div>
      </div>
      <PrintSheet>
        <div className="print-a4">{tiles}</div>
      </PrintSheet>
    </>
  );
}
