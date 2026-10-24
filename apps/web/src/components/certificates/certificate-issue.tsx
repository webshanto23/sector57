"use client";

import { formatNumber, formatTaka, isZeroMoney, type CertificateDetail, type Locale } from "@s57/shared";
import { Ban, Stamp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { api } from "@/lib/api/client";

/**
 * Issuing a draft: who signs it, and what to do about unpaid bills on the unit. A no-dues
 * certificate can't be issued while anything is owed; other types need "issue anyway". The
 * API checks the person and the bills again.
 */
export function IssueCard({ certificate, signer }: { certificate: CertificateDetail; signer: string }) {
  const t = useTranslations("Certificates");
  const locale = useLocale() as Locale;
  const { status, run } = useSubmit();
  const [name, setName] = useState(signer);
  const [title, setTitle] = useState("");
  const [allowDues, setAllowDues] = useState(false);
  const owes = certificate.dues !== null && !isZeroMoney(certificate.dues.owed);
  const blocked = owes && certificate.type === "no_dues";

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("issueTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("issueHint")}</p>
      {owes ? (
        <Note tone="warn">
          {t("duesOwe", { amount: formatTaka(certificate.dues!.owed, locale), count: formatNumber(certificate.dues!.bills, locale) })}{" "}
          {blocked ? t("noDuesBlocked") : null}
        </Note>
      ) : certificate.dues === null ? (
        <Note>{t("duesHidden")}</Note>
      ) : null}
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <TextField id="certificate-signer" label={t("signerName")} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <TextField
          id="certificate-signer-title"
          label={t("signerTitle")}
          hint={t("signerTitleHint")}
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {certificate.type !== "no_dues" && (owes || certificate.dues === null) ? (
        <CheckField id="certificate-allow-dues" label={t("allowDues")} hint={t("allowDuesHint")} checked={allowDues} onChange={(e) => setAllowDues(e.target.checked)} />
      ) : null}
      <div className="justify-self-start">
        <ConfirmButton
          label={t("issue")}
          question={t("issueConfirm")}
          icon={Stamp}
          disabled={blocked || !name.trim() || (owes && !allowDues)}
          onConfirm={async () => {
            await run(
              () =>
                api.POST("/certificates/{id}/issue", {
                  params: { path: { id: certificate.id } },
                  body: { signerName: name, signerTitle: title.trim() || null, allowDues },
                }),
              t("issuedNow"),
            );
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

/** Voiding an issued certificate (a mistake, or withdrawn): asks why. The number stays used. */
export function VoidCard({ certificate }: { certificate: CertificateDetail }) {
  const t = useTranslations("Certificates");
  const { status, run } = useSubmit();
  const [reason, setReason] = useState("");

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("voidTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("voidHint")}</p>
      <TextField id="certificate-void-reason" label={t("voidReason")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      <div className="justify-self-start">
        <ConfirmButton
          label={t("void")}
          question={t("voidConfirm", { certNo: certificate.certNo ?? "" })}
          icon={Ban}
          destructive
          disabled={!reason.trim()}
          onConfirm={async () => {
            await run(() => api.POST("/certificates/{id}/void", { params: { path: { id: certificate.id } }, body: { reason } }));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
