"use client";

import { asciiDigits, formatMembershipCode, localDigits, nextMemberNumber, type Locale, type MembershipSettings } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * Settings card for membership IDs: the society code and the first member number, with the next
 * ID as it would be. A new code re-issues every ID already given, so the card warns before saving.
 */
export function MembershipSettingsCard({ settings, canEdit }: { settings: MembershipSettings; canEdit: boolean }) {
  const t = useTranslations("Members.idSettings");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [code, setCode] = useState(settings.societyCode);
  const [start, setStart] = useState(String(settings.firstMemberNo));

  const typedCode = code.trim().toUpperCase();
  const typedStart = Number(asciiDigits(start).trim());
  const startValid = Number.isInteger(typedStart) && typedStart >= 1;
  const preview =
    /^[A-Z0-9]{2,10}$/.test(typedCode) && startValid ? formatMembershipCode(typedCode, nextMemberNumber(typedStart, settings.highestMemberNo)) : null;
  const recoding = typedCode !== settings.societyCode && settings.issued > 0;

  return (
    <Card className="grid max-w-[900px] gap-3.5">
      <div>
        <h2 className="text-[15px]">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </div>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(() => api.PUT("/settings/membership", { body: { societyCode: typedCode, firstMemberNo: typedStart } }));
        }}
      >
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <TextField
            id="society-code"
            label={t("code")}
            hint={t("codeHint")}
            value={code}
            maxLength={10}
            lang="en"
            autoComplete="off"
            className="[&_input]:uppercase"
            disabled={!canEdit}
            onChange={(e) => setCode(e.target.value)}
          />
          <TextField
            id="first-member-no"
            label={t("start")}
            hint={t("startHint")}
            value={start}
            inputMode="numeric"
            autoComplete="off"
            disabled={!canEdit}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <p className="text-[13px] text-muted-foreground">
          {preview ? t("next", { code: preview }) : t("nextInvalid")}{" "}
          {localDigits(t("issued", { count: settings.issued }), locale)}
        </p>
        {recoding ? <Note tone="warn">{localDigits(t("recodeWarning", { count: settings.issued }), locale)}</Note> : null}
        <FormStatus status={status} />
        {canEdit ? (
          <Button type="submit" disabled={busy || !preview} className="justify-self-start">
            {t("save")}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
