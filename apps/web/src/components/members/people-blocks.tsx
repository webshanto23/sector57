"use client";

import { localDigits, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** A titled block with its add buttons on the right. */
export function Block({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] border border-dashed border-line p-3 text-[13px] text-muted-foreground">{children}</p>;
}

/** Older rows, folded away. */
export function Past({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const locale = useLocale() as Locale;
  if (count === 0) return null;
  return (
    <details className="rounded-[10px] border border-line p-2.5 text-[13px]">
      <summary className="cursor-pointer font-semibold">
        {title} ({localDigits(count, locale)})
      </summary>
      <ul className="mt-2 grid gap-2">{children}</ul>
    </details>
  );
}

export const rowClass = "grid gap-2 rounded-[10px] border border-line bg-surface p-3 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-center";

export function FormActions({ busy, ready, onCancel }: { busy: boolean; ready: boolean; onCancel: () => void }) {
  const t = useTranslations("Members.people");
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || !ready}>
        {t("add")}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}
