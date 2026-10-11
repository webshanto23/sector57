"use client";

import { formatTaka, localDigits, type Locale } from "@s57/shared";
import { Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { useSubmit } from "@/components/property/use-submit";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/** Confirms the previewed run. The API works it out again under its lock, so it bills what is due at that moment. */
export function ConfirmRun({ month, invoices, total }: { month: string; invoices: number; total: string }) {
  const t = useTranslations("Recurring.run");
  const locale = useLocale() as Locale;
  const { status, setStatus, run } = useSubmit();
  const [made, setMade] = useState(false);

  return (
    <div className="grid gap-2">
      <div>
        <ConfirmButton
          label={t("confirm")}
          question={t("confirmQuestion", { invoices: localDigits(invoices, locale), total: formatTaka(total, locale) })}
          icon={Repeat}
          onConfirm={async () => {
            const result = await run(() => api.POST("/billing-runs", { body: { month } }));
            if (result) {
              setMade(true);
              setStatus({ ok: true, text: t("done", { invoices: localDigits(result.invoiceCount, locale), total: formatTaka(result.total, locale) }) });
            }
          }}
        />
      </div>
      <FormStatus status={status} />
      {made ? (
        <Link href="/dashboard/billing" className="text-[13.5px] font-semibold text-primary">
          {t("openBills")}
        </Link>
      ) : null}
    </div>
  );
}
