"use client";

import { formatDate, formatTaka, type Locale, type StickerRow, type VehicleDetail } from "@s57/shared";
import { Ban, Printer, RefreshCw, Replace, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { StickerCell, StickerStateChip } from "./vehicle-chips";

type Can = { issue: boolean; revoke: boolean };

/**
 * A vehicle's sticker: the latest one and what can be done with it (issue a first or a new one,
 * renew for the next sticker year, replace a lost one, revoke), and the ones before it.
 */
export function VehicleStickers({ vehicle, history, can, fee }: { vehicle: VehicleDetail; history: StickerRow[]; can: Can; fee: string | null }) {
  const t = useTranslations("Vehicles");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [nextYear, setNextYear] = useState(false);
  const [reason, setReason] = useState("");
  const latest = vehicle.sticker;
  const onFile = vehicle.removedAt === null;
  const state = latest?.state ?? null;
  const mayIssue = onFile && can.issue && (state === null || state === "revoked" || state === "replaced");
  const mayRenew = onFile && can.issue && (state === "active" || state === "expired");
  const mayReplace = onFile && can.issue && state === "active";
  const mayRevoke = can.revoke && (state === "active" || state === "expired");
  const id = latest?.id ?? "";
  const earlier = history.filter((row) => row.id !== id);

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("stickerTitle")}</h2>
      <StickerCell sticker={latest} />
      {fee && (mayIssue || mayRenew || mayReplace) ? <p className="text-[12.5px] text-muted-foreground">{t("feeNote", { amount: formatTaka(fee, locale) })}</p> : null}

      {mayIssue ? (
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="accent-primary" checked={nextYear} onChange={(e) => setNextYear(e.target.checked)} />
            {t("nextYear")}
          </label>
          <Button
            type="button"
            className="justify-self-start"
            disabled={busy}
            onClick={() => void run(() => api.POST("/stickers", { body: { vehicleId: vehicle.id, nextYear } }), t("issued"))}
          >
            <Tag aria-hidden />
            {t("issue")}
          </Button>
        </div>
      ) : null}

      {mayRenew || mayReplace || state === "active" ? (
        <div className="flex flex-wrap gap-2">
          {state === "active" ? (
            <Link href={{ pathname: "/dashboard/vehicles/stickers/print", query: { ids: id } }} className={buttonVariants({ variant: "outline" })}>
              <Printer aria-hidden />
              {t("print")}
            </Link>
          ) : null}
          {mayRenew ? (
            <ConfirmButton
              label={t("renewOne")}
              question={t("renewOneConfirm", { no: latest!.stickerNo })}
              icon={RefreshCw}
              disabled={busy}
              onConfirm={async () => {
                await run(() => api.POST("/stickers/renew", { body: { stickerIds: [id] } }), t("renewed"));
              }}
            />
          ) : null}
          {mayReplace ? (
            <ConfirmButton
              label={t("replace")}
              question={t("replaceConfirm", { no: latest!.stickerNo })}
              icon={Replace}
              disabled={busy}
              onConfirm={async () => {
                await run(() => api.POST("/stickers/{id}/replace", { params: { path: { id } } }), t("replaced"));
              }}
            />
          ) : null}
        </div>
      ) : null}

      {mayRevoke ? (
        <div className="grid gap-2 border-t border-line pt-3">
          <TextField id="sticker-revoke-reason" label={t("revokeReason")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="justify-self-start">
            <ConfirmButton
              label={t("revoke")}
              question={t("revokeConfirm", { no: latest!.stickerNo })}
              icon={Ban}
              destructive
              disabled={busy || !reason.trim()}
              onConfirm={async () => {
                const done = await run(() => api.POST("/stickers/{id}/revoke", { params: { path: { id } }, body: { reason } }), t("revoked"));
                if (done) setReason("");
              }}
            />
          </div>
        </div>
      ) : null}
      <FormStatus status={status} />

      {earlier.length > 0 ? (
        <div className="grid gap-1.5 border-t border-line pt-3">
          <h3 className="text-[13.5px] font-semibold">{t("history")}</h3>
          <ul className="grid gap-1.5 text-[13px]">
            {earlier.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2">
                <span className="num font-semibold">{row.stickerNo}</span>
                <StickerStateChip state={row.state} />
                <span className="num text-muted-foreground">{t("validUntil", { date: formatDate(row.validUntil, locale, "short") })}</span>
                {row.revokeReason ? <span className="text-muted-foreground">· {row.revokeReason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
