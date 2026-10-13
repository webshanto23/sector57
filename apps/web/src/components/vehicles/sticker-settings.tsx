"use client";

import { formatStickerNo, formatTaka, pick, STICKER_VALIDITIES, type ChargeType, type Locale, type StickerSettingsView, type StickerValidity } from "@s57/shared";
import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * The society's sticker setting: the number prefix, whether stickers last to 31 December or to the
 * end of the fiscal year, and an optional fee billed to the unit. Editable with `settings.edit`; a
 * fee needs the charge types (billing view) to choose from.
 */
export function StickerSettingsCard({ view, chargeTypes }: { view: StickerSettingsView; chargeTypes: ChargeType[] | null }) {
  const t = useTranslations("Vehicles.settings");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const saved = view.settings;
  const [prefix, setPrefix] = useState(saved.prefix);
  const [validity, setValidity] = useState<StickerValidity>(saved.validity);
  const [billed, setBilled] = useState(saved.fee !== null);
  const [chargeTypeId, setChargeTypeId] = useState(saved.fee?.chargeTypeId ?? "");
  const [amount, setAmount] = useState(saved.fee?.amount ?? "");
  const savedType = chargeTypes?.find((type) => type.id === saved.fee?.chargeTypeId);
  const feeText = saved.fee
    ? t("feeBilled", { amount: formatTaka(saved.fee.amount, locale), type: savedType ? pick(savedType.nameBn, savedType.nameEn, locale) : "" })
    : t("feeFree");

  if (!view.can.edit) {
    return (
      <Card className="grid gap-1.5 text-[13.5px]">
        <h2 className="text-[15px]">{t("title")}</h2>
        <p>{t("numbering", { example: formatStickerNo(saved.prefix, 1) })}</p>
        <p>{t(`validityText.${saved.validity}`)}</p>
        <p>{feeText}</p>
      </Card>
    );
  }

  const open = chargeTypes?.filter((type) => !type.archived || type.id === saved.fee?.chargeTypeId) ?? [];
  const fee = billed ? (chargeTypes ? { chargeTypeId, amount } : saved.fee) : null;
  const ready = prefix.trim() !== "" && (!billed || (fee !== null && fee.chargeTypeId !== "" && fee.amount.trim() !== ""));

  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("title")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.PUT("/vehicles/settings", { body: { prefix, validity, fee } }));
        }}
      >
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <TextField
            id="sticker-prefix"
            label={t("prefix")}
            hint={t("prefixHint", { example: formatStickerNo(prefix.trim() || saved.prefix, 1) })}
            value={prefix}
            maxLength={10}
            onChange={(e) => setPrefix(e.target.value)}
          />
          <Field label={t("validity")} htmlFor="sticker-validity">
            <select id="sticker-validity" className={inputClass} value={validity} onChange={(e) => setValidity(e.target.value as StickerValidity)}>
              {STICKER_VALIDITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`validityOption.${value}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div role="radiogroup" aria-label={t("fee")} className="flex flex-wrap gap-4 text-[13.5px]">
          <label className="flex items-center gap-2">
            <input type="radio" name="sticker-fee" className="accent-primary" checked={!billed} onChange={() => setBilled(false)} />
            {t("free")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="sticker-fee" className="accent-primary" checked={billed} disabled={!chargeTypes && !saved.fee} onChange={() => setBilled(true)} />
            {t("billed")}
          </label>
        </div>
        {billed && chargeTypes ? (
          <div className="grid gap-3.5 min-[600px]:grid-cols-2">
            <Field label={t("chargeType")} htmlFor="sticker-charge-type">
              <select id="sticker-charge-type" className={inputClass} value={chargeTypeId} onChange={(e) => setChargeTypeId(e.target.value)}>
                <option value="">{t("chooseChargeType")}</option>
                {open.map((type) => (
                  <option key={type.id} value={type.id}>
                    {pick(type.nameBn, type.nameEn, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <TextField id="sticker-amount" label={t("amount")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        ) : billed ? (
          <p className="text-[13px] text-muted-foreground">{feeText}</p>
        ) : null}
        {!chargeTypes ? <p className="text-[12.5px] text-muted-foreground">{t("needsBilling")}</p> : null}
        <Button type="submit" disabled={busy || !ready} className="justify-self-start">
          <Save aria-hidden />
          {t("save")}
        </Button>
      </form>
      <FormStatus status={status} />
    </Card>
  );
}
