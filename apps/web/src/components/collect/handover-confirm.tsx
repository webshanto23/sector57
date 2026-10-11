"use client";

import { compareMoney, formatTaka, moneyOrZeroSchema, subtractMoney, type Locale } from "@s57/shared";
import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { api } from "@/lib/api/client";

/** The treasurer types what they counted; a difference shows at once and needs a note. */
export function HandoverConfirm({ id, expected }: { id: string; expected: string }) {
  const t = useTranslations("Collect.handover");
  const locale = useLocale() as Locale;
  const { status, run } = useSubmit();
  const [counted, setCounted] = useState(expected);
  const [note, setNote] = useState("");
  const parsed = moneyOrZeroSchema.safeParse(counted);
  const difference = parsed.success ? subtractMoney(parsed.data, expected) : null;
  const sign = difference === null ? 0 : compareMoney(difference, "0");
  const needsNote = sign !== 0 && note.trim() === "";

  return (
    <div className="grid gap-3 border-t border-line pt-3">
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("countLabel")} htmlFor={`count-${id}`}>
          <input
            id={`count-${id}`}
            inputMode="decimal"
            className={`${inputClass} num`}
            value={counted}
            aria-invalid={!parsed.success || undefined}
            onChange={(e) => setCounted(e.target.value)}
          />
        </Field>
        <Field label={t("noteLabel")} htmlFor={`note-${id}`}>
          <input id={`note-${id}`} className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {difference !== null ? (
        <p className={`num text-[13.5px] font-semibold ${sign === 0 ? "text-good" : "text-bad"}`}>
          {sign === 0
            ? t("exact")
            : sign < 0
              ? t("short", { amount: formatTaka(subtractMoney("0", difference), locale) })
              : t("over", { amount: formatTaka(difference, locale) })}
        </p>
      ) : null}
      <div>
        <ConfirmButton
          label={t("confirm")}
          question={t("confirmQuestion", { amount: parsed.success ? formatTaka(parsed.data, locale) : counted })}
          icon={CircleCheck}
          disabled={!parsed.success || needsNote}
          onConfirm={async () => {
            await run(() => api.POST("/handovers/{id}/confirm", { params: { path: { id } }, body: { amountCounted: counted, note: note || null } }), t("confirmedNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </div>
  );
}
