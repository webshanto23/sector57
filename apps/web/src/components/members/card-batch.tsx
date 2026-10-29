"use client";

import { cardSheets, localDigits, MAX_CARD_BATCH, type CardSkipCode, type Locale, type MemberCard } from "@s57/shared";
import { FileDown, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, use, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { FormStatus } from "@/components/admin/form-status";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { downloadCardPdf } from "./card-pdf";
import { IdCardBack, IdCardFront } from "./id-card";

/** Nine cards on an A4 page: three across, three down. */
const COLUMNS = 3;
const ROWS = 3;

/** `sheets`: A4 pages of nine, backs lined up for double-sided printing. `card`: one face per page for a card printer. */
type Output = "sheets" | "card" | "pdf";

type Ticks = { ticked: string[]; toggle: (id: string) => void };
const TicksContext = createContext<Ticks | null>(null);

/**
 * The members list with tick boxes for ID cards: members with an ID (`eligible`, membership ids
 * in page order) can be ticked and their cards printed on A4 sheets, on a card printer, or
 * downloaded as one PDF. The API leaves out anyone the caller may not print, and says why.
 */
export function CardTicks({ eligible, children }: { eligible: string[]; children: ReactNode }) {
  const t = useTranslations("Members.idCard");
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run } = useSubmit();
  const [ticked, setTicked] = useState<string[]>([]);
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [output, setOutput] = useState<Output>("sheets");
  // Busy from asking the API until the PDF is saved, not just the request.
  const [working, setWorking] = useState(false);
  const faces = useRef<HTMLDivElement>(null);
  // Rows that left the page (filtered away, another page) drop out of the ticks.
  const live = ticked.filter((id) => eligible.includes(id));
  const allTicked = eligible.length > 0 && live.length === eligible.length;
  const tooMany = live.length > MAX_CARD_BATCH;

  const toggle = (id: string) => setTicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

  const make = async (next: Output) => {
    setWorking(true);
    setOutput(next);
    try {
      await makeCards(next);
    } finally {
      setWorking(false);
    }
  };

  const makeCards = async (next: Output) => {
    const result = await run(() => api.POST("/memberships/cards", { body: { membershipIds: live } }));
    if (!result) return;
    const counts = new Map<CardSkipCode, number>();
    for (const skip of result.skipped) counts.set(skip.code, (counts.get(skip.code) ?? 0) + 1);
    const left = [...counts].map(([code, count]) => t(`skip.${code}`, { count })).join(" ");
    setStatus({ ok: result.items.length > 0, text: localDigits([t("batchDone", { count: result.items.length }), left].filter(Boolean).join(" "), locale) });
    if (result.items.length === 0) return;
    // The faces must be on the page before the browser prints or pictures them.
    flushSync(() => {
      setCards(result.items);
      setOutput(next);
    });
    if (next !== "pdf") return window.print();
    try {
      const all = [...(faces.current?.querySelectorAll<HTMLElement>("[data-face]") ?? [])];
      await downloadCardPdf(all, t("batchPdfName", { count: result.items.length }), { scale: 4, jpeg: true });
    } catch {
      setStatus({ ok: false, text: t("pdfFailed") });
    } finally {
      setCards([]);
    }
  };

  return (
    <TicksContext value={{ ticked: live, toggle }}>
      {eligible.length > 0 ? (
        <Card className="mb-3.5 grid gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-4 accent-primary" checked={allTicked} onChange={() => setTicked(allTicked ? [] : [...eligible])} />
              {t("tickAll")}
            </label>
            <Button type="button" disabled={busy || working || live.length === 0 || tooMany} onClick={() => make("sheets")}>
              <Printer aria-hidden />
              {localDigits(t("printSheets", { count: live.length }), locale)}
            </Button>
            <Button type="button" variant="outline" disabled={busy || working || live.length === 0 || tooMany} onClick={() => make("card")}>
              <Printer aria-hidden />
              {t("printCard")}
            </Button>
            <Button type="button" variant="outline" disabled={busy || working || live.length === 0 || tooMany} onClick={() => make("pdf")}>
              <FileDown aria-hidden />
              {working && output === "pdf" ? t("pdfBusy") : t("downloadPdf")}
            </Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {tooMany ? localDigits(t("tooManyCards", { max: MAX_CARD_BATCH }), locale) : t("sheetsHint")}
          </p>
          <FormStatus status={status} />
        </Card>
      ) : null}
      {children}

      {output === "pdf" && cards.length ? (
        // Off screen, at real size: the PDF pictures these faces one by one.
        <div ref={faces} aria-hidden className="fixed top-0 -left-[10000px] flex gap-4">
          {cards.map((card) => (
            <div key={card.membershipId} className="contents">
              <div data-face>
                <IdCardFront card={card} />
              </div>
              <div data-face>
                <IdCardBack card={card} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <PrintSheet>
        {output === "card" ? (
          // Pages must be siblings for the page break between them (`.print-page + .print-page`).
          <div className="print-id-card">
            {cards.flatMap((card) => [
              <div key={`${card.membershipId}-front`} className="print-page">
                <IdCardFront card={card} />
              </div>,
              <div key={`${card.membershipId}-back`} className="print-page">
                <IdCardBack card={card} />
              </div>,
            ])}
          </div>
        ) : output === "sheets" ? (
          <div className="print-a4">
            {cardSheets(cards, COLUMNS, ROWS).flatMap((sheet, i) => [
              <Sheet key={`front-${i}`} cards={sheet.fronts} face="front" />,
              <Sheet key={`back-${i}`} cards={sheet.backs} face="back" />,
            ])}
          </div>
        ) : null}
      </PrintSheet>
    </TicksContext>
  );
}

/** One A4 page of nine faces, centred, each with a dashed cut line just outside it; empty places stay blank. */
function Sheet({ cards, face }: { cards: (MemberCard | null)[]; face: "front" | "back" }) {
  return (
    <div className="print-page grid justify-center gap-x-[5mm] gap-y-[3mm] pt-[2mm]" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 54mm)` }}>
      {cards.map((card, i) =>
        card ? (
          <div key={i} className="outline-[0.2mm] outline-offset-[0.8mm] outline-[#9aa39c] outline-dashed">
            {face === "front" ? <IdCardFront card={card} /> : <IdCardBack card={card} />}
          </div>
        ) : (
          <div key={i} className="h-[85.6mm] w-[54mm]" />
        ),
      )}
    </div>
  );
}

/** The tick box on one member row; only inside `CardTicks`. */
export function CardTickBox({ id, name }: { id: string; name: string }) {
  const t = useTranslations("Members.idCard");
  const ticks = use(TicksContext);
  if (!ticks) return null;
  return (
    <input
      type="checkbox"
      className="size-4 flex-none accent-primary"
      aria-label={t("tickMember", { name })}
      checked={ticks.ticked.includes(id)}
      onChange={() => ticks.toggle(id)}
    />
  );
}
