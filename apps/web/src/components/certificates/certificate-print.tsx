"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";

/** The print button, the letter on screen, and the same letter alone on A4 when printing. */
export function CertificatePrintView({ children }: { children: ReactNode }) {
  const t = useTranslations("Certificates");
  return (
    <>
      <Button type="button" onClick={() => window.print()} className="justify-self-start">
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <div className="overflow-x-auto">
        <div className="mx-auto max-w-[794px] min-w-[600px]">{children}</div>
      </div>
      <PrintSheet>
        <div className="print-a4">{children}</div>
      </PrintSheet>
    </>
  );
}
