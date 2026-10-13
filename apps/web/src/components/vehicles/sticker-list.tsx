"use client";

import { formatDate, formatNumber, STICKER_RENEW_LIMIT, STICKER_SHEET_LIMIT, type Locale, type StickerRow } from "@s57/shared";
import { Printer, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { DataTable, type Column } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { StickerStateChip } from "./vehicle-chips";

/** Active or expired: may be renewed. */
const renewable = (row: StickerRow) => row.state === "active" || row.state === "expired";

/**
 * Stickers as a table (cards on phones) with a tick box on each that can be renewed: the
 * ticked ones are renewed together for the next sticker year, or those in force printed on A4.
 */
export function StickerList({ rows, canIssue, empty }: { rows: StickerRow[]; canIssue: boolean; empty: string }) {
  const t = useTranslations("Vehicles");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run } = useSubmit();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = rows.filter((row) => picked.has(row.id));
  const printable = chosen.filter((row) => row.state === "active").slice(0, STICKER_SHEET_LIMIT);
  const selectable = rows.filter(renewable);
  const all = selectable.length > 0 && selectable.every((row) => picked.has(row.id));

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function renew() {
    const ids = chosen.filter(renewable).slice(0, STICKER_RENEW_LIMIT).map((row) => row.id);
    const result = await run(() => api.POST("/stickers/renew", { body: { stickerIds: ids } }));
    if (!result) return;
    setPicked(new Set());
    const numbers = new Map(rows.map((row) => [row.id, row.stickerNo]));
    const skipped = result.skipped.map((skip) => `${numbers.get(skip.stickerId) ?? ""}: ${tRoot(errorMessageKey({ code: skip.code }))}`);
    setStatus({
      ok: result.skipped.length === 0,
      text: [t("renewDone", { renewed: formatNumber(result.renewed.length, locale), skipped: formatNumber(result.skipped.length, locale) }), ...skipped].join(" "),
    });
  }

  const columns: Column<StickerRow>[] = [
    {
      key: "no",
      header: (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary"
            checked={all}
            disabled={selectable.length === 0}
            aria-label={t("pickAll")}
            onChange={() => setPicked(all ? new Set() : new Set(selectable.map((row) => row.id)))}
          />
          {t("col.stickerNo")}
        </label>
      ),
      cell: (row) => (
        <span className="flex items-start gap-2">
          {renewable(row) ? (
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={picked.has(row.id)}
              aria-label={t("pick", { no: row.stickerNo })}
              onChange={() => toggle(row.id)}
            />
          ) : null}
          <span className="grid">
            <span className="num font-semibold">{row.stickerNo}</span>
            <span className="text-[12.5px] text-muted-foreground">
              {t(`reason.${row.reason}`)}
              {row.replaces ? ` · ${t("replacesNo", { no: row.replaces.stickerNo })}` : ""}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "vehicle",
      header: t("col.regNo"),
      cell: (row) => (
        <Link href={`/dashboard/vehicles/${row.vehicle.id}`} className="grid text-fg">
          <span className="num font-semibold">{row.vehicle.regNo}</span>
          <span className="text-[12.5px] text-muted-foreground">
            {t(`kind.${row.vehicle.kind}`)}
            {row.vehicle.removed ? ` · ${t("removed")}` : ""}
          </span>
        </Link>
      ),
    },
    { key: "unit", header: t("col.unit"), cell: (row) => [...row.place.address, row.place.name].join(", ") },
    {
      key: "state",
      header: t("col.state"),
      cell: (row) => (
        <span className="grid justify-items-start gap-0.5">
          <StickerStateChip state={row.state} />
          <span className="num text-[12.5px] text-muted-foreground">{t("validUntil", { date: formatDate(row.validUntil, locale, "short") })}</span>
        </span>
      ),
    },
    {
      key: "bill",
      header: t("col.bill"),
      cell: (row) =>
        row.invoice ? (
          <Link href={`/dashboard/billing/${row.invoice.id}`} className="num text-primary">
            {row.invoice.invoiceNo}
          </Link>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="grid gap-3">
      {chosen.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-surface-2 px-3 py-2 text-[13.5px]">
          <span className="font-semibold">{t("picked", { count: formatNumber(chosen.length, locale) })}</span>
          {canIssue ? (
            <ConfirmButton
              label={t("renew")}
              question={t("renewConfirm", { count: formatNumber(chosen.length, locale) })}
              icon={RefreshCw}
              disabled={busy}
              onConfirm={renew}
            />
          ) : null}
          {printable.length > 0 ? (
            <Link
              href={{ pathname: "/dashboard/vehicles/stickers/print", query: { ids: printable.map((row) => row.id).join(",") } }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Printer aria-hidden />
              {t("printPicked", { count: formatNumber(printable.length, locale) })}
            </Link>
          ) : null}
        </div>
      ) : null}
      <FormStatus status={status} />
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("tabs.stickers")} empty={empty} />
    </div>
  );
}
