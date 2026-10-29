"use client";

import { formatDate, type Locale } from "@s57/shared";
import { BadgeCheck, ShieldOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Chip } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * Whether a person's or organisation's details were checked against their papers, with the
 * button to mark or clear it (`members.approve`). Marking a member who has no membership ID yet
 * issues it; clearing the mark keeps the ID.
 */
export function VerifyCard({
  party,
  verifiedAt,
  canVerify,
  idPending,
}: {
  party: { kind: "person" | "organisation"; id: string };
  verifiedAt: string | null;
  canVerify: boolean;
  /** An active member still waiting for their membership ID. */
  idPending: boolean;
}) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const params = { params: { path: { id: party.id } }, body: { verified: !verifiedAt } };

  return (
    <Card className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {verifiedAt ? (
          <Chip tone="good">{t("verifiedOn", { date: formatDate(verifiedAt, locale, "short") })}</Chip>
        ) : (
          <Chip tone="warn">{t("notVerified")}</Chip>
        )}
      </div>
      {canVerify ? (
        <>
          {!verifiedAt ? <p className="text-[12.5px] text-muted-foreground">{t("verifyHint")}</p> : null}
          {!verifiedAt && idPending ? <p className="text-[12.5px] text-muted-foreground">{t("verifyIssuesId")}</p> : null}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={busy}
            onClick={() =>
              party.kind === "person" ? run(() => api.PUT("/persons/{id}/verified", params)) : run(() => api.PUT("/organisations/{id}/verified", params))
            }
          >
            {verifiedAt ? <ShieldOff aria-hidden /> : <BadgeCheck aria-hidden />}
            {verifiedAt ? t("unverify") : t("verify")}
          </Button>
        </>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}
