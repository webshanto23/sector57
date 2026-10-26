"use client";

import { pickFormat, type PrintChoice, type PrintDocument, type PrintFormat } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

const keyOf = (document: PrintDocument) => `s57.print.${document}`;
const noop = () => () => {};

function remembered(document: PrintDocument): string | null {
  try {
    return localStorage.getItem(keyOf(document));
  } catch {
    // Private mode or blocked storage: the society's default prints.
    return null;
  }
}

/**
 * The paper a document prints on: what was picked here, else what this device used last, else
 * the society's default, each only while the society still offers it. A pick is remembered
 * on this device, so the office PC keeps A4 and a collector's phone keeps its own.
 */
export function usePrintFormat(document: PrintDocument, choice: PrintChoice): [PrintFormat, (format: PrintFormat) => void] {
  const device = useSyncExternalStore(
    noop,
    () => remembered(document),
    () => null,
  );
  const [picked, setPicked] = useState<PrintFormat | null>(null);

  function pick(format: PrintFormat) {
    setPicked(format);
    try {
      localStorage.setItem(keyOf(document), format);
    } catch {
      // Not remembered, but this print still uses it.
    }
  }

  return [pickFormat(choice, device, picked), pick];
}

/** A choice without the thermal roll (printing many documents at once); falls back to A5 if nothing else is offered. */
export function onSheets(choice: PrintChoice): PrintChoice {
  const offered: PrintFormat[] = choice.offered.filter((format) => format !== "thermal80");
  if (offered.length === 0) return { default: "a5", offered: ["a5"] };
  return { default: offered.includes(choice.default) ? choice.default : offered[0]!, offered };
}

/** "Paper: A4 / A5", shown only when the society offers more than one. */
export function PrintFormatPicker({ choice, value, onChange }: { choice: PrintChoice; value: PrintFormat; onChange: (format: PrintFormat) => void }) {
  const t = useTranslations("Print");
  if (choice.offered.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={t("paper")} className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] text-muted-foreground">{t("paper")}</span>
      {choice.offered.map((format) => (
        <label
          key={format}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-accent"
        >
          <input type="radio" name="print-format" className="accent-[var(--accent-brand)]" checked={value === format} onChange={() => onChange(format)} />
          {t(`format.${format}`)}
        </label>
      ))}
    </div>
  );
}
