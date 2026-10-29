"use client";

import { asciiDigits, MAX_CARD_TERMS, MAX_CARD_YEARS, type MemberCardSettings } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const lines = (value: string) => value.split("\n").filter((line) => line.trim() !== "");

/**
 * Settings card for the membership ID card: the terms on its back (one per line, Bangla and
 * English), how many years a card is valid (blank: no "Valid till" line) and the label under
 * the signature line.
 */
export function CardSettingsCard({ settings, canEdit }: { settings: MemberCardSettings; canEdit: boolean }) {
  const t = useTranslations("Members.cardSettings");
  const { status, busy, run } = useSubmit();
  const [termsBn, setTermsBn] = useState(settings.termsBn.join("\n"));
  const [termsEn, setTermsEn] = useState(settings.termsEn.join("\n"));
  const [years, setYears] = useState(settings.validYears === null ? "" : String(settings.validYears));
  const [signatureBn, setSignatureBn] = useState(settings.signatureBn ?? "");
  const [signatureEn, setSignatureEn] = useState(settings.signatureEn ?? "");
  const tooMany = lines(termsBn).length > MAX_CARD_TERMS || lines(termsEn).length > MAX_CARD_TERMS;

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
          await run(() =>
            api.PUT("/settings/member-card", {
              body: { termsBn: lines(termsBn), termsEn: lines(termsEn), validYears: years.trim() ? Number(asciiDigits(years).trim()) : null, signatureBn, signatureEn },
            }),
          );
        }}
      >
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <Field label={t("termsBn")} htmlFor="card-terms-bn">
            <textarea id="card-terms-bn" rows={4} className={inputClass} value={termsBn} disabled={!canEdit} onChange={(e) => setTermsBn(e.target.value)} />
            <span className="text-[12.5px] text-muted-foreground">{t("termsHint", { max: MAX_CARD_TERMS })}</span>
          </Field>
          <Field label={t("termsEn")} htmlFor="card-terms-en">
            <textarea id="card-terms-en" rows={4} lang="en" className={inputClass} value={termsEn} disabled={!canEdit} onChange={(e) => setTermsEn(e.target.value)} />
            <span className="text-[12.5px] text-muted-foreground">{t("termsEnHint")}</span>
          </Field>
          <TextField
            id="card-years"
            label={t("years")}
            hint={t("yearsHint", { max: MAX_CARD_YEARS })}
            value={years}
            inputMode="numeric"
            autoComplete="off"
            disabled={!canEdit}
            onChange={(e) => setYears(e.target.value)}
          />
          <div className="grid gap-3 min-[500px]:grid-cols-2">
            <TextField id="card-sign-bn" label={t("signatureBn")} value={signatureBn} maxLength={40} disabled={!canEdit} onChange={(e) => setSignatureBn(e.target.value)} />
            <TextField
              id="card-sign-en"
              label={t("signatureEn")}
              value={signatureEn}
              maxLength={40}
              lang="en"
              disabled={!canEdit}
              onChange={(e) => setSignatureEn(e.target.value)}
            />
          </div>
        </div>
        {tooMany ? <p className="text-[13px] text-bad">{t("tooMany", { max: MAX_CARD_TERMS })}</p> : null}
        <FormStatus status={status} />
        {canEdit ? (
          <Button type="submit" disabled={busy || tooMany} className="justify-self-start">
            {t("save")}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
