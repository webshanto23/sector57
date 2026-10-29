"use client";

import type { MemberCard } from "@s57/shared";
import { FileDown, IdCard, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Card } from "@/components/kit";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { downloadCardPdf } from "./card-pdf";
import { IdCardBack, IdCardFront } from "./id-card";

/** `card`: one CR80 card per page, front then back (a card printer). `a4`: front and back side by side with cut lines. */
type Layout = "card" | "a4";

/**
 * The member page's ID card: both faces at their real size, two ways to print them (RGB from the
 * browser) and a PDF download in colour, one face per page at card size. The PDF is made in the
 * browser from the faces on screen, so nothing leaves the office's computer.
 */
export function IdCardPanel({ card }: { card: MemberCard }) {
  const t = useTranslations("Members.idCard");
  const [layout, setLayout] = useState<Layout>("card");
  const [pdf, setPdf] = useState<"idle" | "busy" | "failed">("idle");
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);

  const print = (next: Layout) => {
    // The sheet must show the chosen layout before the browser takes its picture.
    flushSync(() => setLayout(next));
    window.print();
  };

  const downloadPdf = async () => {
    if (!front.current || !back.current) return;
    setPdf("busy");
    try {
      await downloadCardPdf([front.current, back.current], t("pdfName", { code: card.membershipCode }));
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  };

  return (
    <Card className="grid gap-3.5">
      <div>
        <h2 className="flex items-center gap-2 text-[15px]">
          <IdCard className="size-4 text-primary" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="flex flex-wrap gap-4" aria-label={t("preview")}>
        <div ref={front}>
          <IdCardFront card={card} />
        </div>
        <div ref={back}>
          <IdCardBack card={card} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button type="button" onClick={() => print("card")}>
          <Printer aria-hidden />
          {t("printCard")}
        </Button>
        <Button type="button" variant="outline" onClick={() => print("a4")}>
          <Printer aria-hidden />
          {t("printA4")}
        </Button>
        <Button type="button" variant="outline" disabled={pdf === "busy"} onClick={downloadPdf}>
          <FileDown aria-hidden />
          {pdf === "busy" ? t("pdfBusy") : t("downloadPdf")}
        </Button>
      </div>
      {pdf === "failed" ? (
        <p role="alert" className="text-[12.5px] text-bad">
          {t("pdfFailed")}
        </p>
      ) : null}
      <p className="text-[12.5px] text-muted-foreground">{t("printHint")}</p>

      <PrintSheet>
        {layout === "card" ? (
          <div className="print-id-card">
            <div className="print-page">
              <IdCardFront card={card} />
            </div>
            <div className="print-page">
              <IdCardBack card={card} />
            </div>
          </div>
        ) : (
          <div className="print-a4">
            <div className="flex justify-center gap-[10mm] pt-[10mm]">
              {/* A thin dashed line just outside each card shows where to cut. */}
              <div className="outline-[0.2mm] outline-offset-[1mm] outline-[#9aa39c] outline-dashed">
                <IdCardFront card={card} />
              </div>
              <div className="outline-[0.2mm] outline-offset-[1mm] outline-[#9aa39c] outline-dashed">
                <IdCardBack card={card} />
              </div>
            </div>
          </div>
        )}
      </PrintSheet>
    </Card>
  );
}
