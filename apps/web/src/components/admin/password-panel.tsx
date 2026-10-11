"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A temporary password, shown once, with a copy button. It lives only in this component's state. */
export function PasswordPanel({ password }: { password: string }) {
  const t = useTranslations("Admin.users");
  const [copied, setCopied] = useState(false);

  return (
    <div role="status" className="grid gap-2.5 rounded-[12px] border border-warn bg-warn-soft p-3.5">
      <div className="flex items-center gap-2 font-semibold text-warn">
        <KeyRound className="size-[16px]" aria-hidden />
        {t("passwordTitle")}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <code className="rounded-[8px] border border-line bg-surface px-3 py-1.5 font-mono text-[18px] tracking-[0.08em] select-all">
          {password}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              // No clipboard access (plain http, old browser): the text is selectable instead.
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="text-[13px] text-fg">{t("passwordNote")}</p>
    </div>
  );
}
