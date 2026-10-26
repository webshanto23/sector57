"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PX_PER_MM = 96 / 25.4;
/** A little paper after the last line, so the cutter clears it. */
const TAIL_MM = 6;

/**
 * An 80 mm thermal roll: 72 mm of print, black only. A roll has no page length and Chrome
 * ignores `size: 80mm auto`, so an off-screen copy is measured and the page (`thermal80`)
 * gets exactly that length; the receipt then prints as one strip, however long. Goes inside
 * `PrintSheet`. Keep the content's height the same between renders that happen just before
 * printing (reserve a line rather than adding one), or the length may lag a line.
 */
export function ThermalSheet({ children }: { children: ReactNode }) {
  const measure = useRef<HTMLDivElement>(null);
  const [lengthMm, setLengthMm] = useState(200);

  useEffect(() => {
    const node = measure.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setLengthMm(Math.ceil(node.getBoundingClientRect().height / PX_PER_MM) + TAIL_MM));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const roll = <div className="thermal-roll w-[72mm] text-[9.5pt] leading-snug text-foreground">{children}</div>;
  return (
    <>
      <style>{`@media print { @page thermal80 { size: 80mm ${lengthMm}mm; margin: 0; } }`}</style>
      <div className="print-thermal px-[4mm] pt-[3mm]">{roll}</div>
      {createPortal(
        <div ref={measure} aria-hidden className="pointer-events-none fixed top-0 -left-[200mm] pt-[3mm] opacity-0">
          {roll}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A dashed rule across the roll. */
export const ThermalRule = () => <hr className="my-[1.5mm] border-0 border-t border-dashed border-foreground" />;
