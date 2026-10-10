"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A button that asks once before acting: the first press shows the question with
 * Confirm and Cancel, the second runs `onConfirm`. No browser dialog, so it works the
 * same on phones and reads well in Bangla.
 */
export function ConfirmButton({
  label,
  question,
  icon: Icon,
  destructive = false,
  disabled = false,
  onConfirm,
}: {
  label: string;
  question: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <Button type="button" variant={destructive ? "destructive" : "outline"} disabled={disabled} onClick={() => setAsking(true)}>
        {Icon ? <Icon aria-hidden /> : null}
        {label}
      </Button>
    );
  }

  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-[8px] border border-line bg-surface-2 p-3">
      <p className="text-[13.5px] font-medium">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          disabled={busy}
          autoFocus
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setAsking(false);
            }
          }}
        >
          {busy ? t("Admin.saving") : t("Admin.confirm")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setAsking(false)}>
          {t("Common.cancel")}
        </Button>
      </div>
    </div>
  );
}
