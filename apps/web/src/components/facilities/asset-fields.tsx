"use client";

import { localDigits, pick, type AssetDetail, type AssetOptions, type CustodianList, type Locale } from "@s57/shared";
import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { TextField } from "@/components/cms/fields";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** An asset's details as typed; the API cleans and checks every field. */
export type AssetValues = {
  nameBn: string;
  nameEn: string;
  category: string;
  purchasedOn: string;
  purchaseCost: string;
  vendorId: string;
  expenseVoucherNo: string;
  warrantyUntil: string;
  note: string;
};

export const assetValues = (asset?: AssetDetail): AssetValues => ({
  nameBn: asset?.name.bn ?? "",
  nameEn: asset?.name.en ?? "",
  category: asset?.category ?? "",
  purchasedOn: asset?.purchasedOn ?? "",
  purchaseCost: asset?.purchaseCost ?? "",
  vendorId: asset?.vendor?.id ?? "",
  expenseVoucherNo: asset?.expense?.voucherNo ?? "",
  warrantyUntil: asset?.warrantyUntil ?? "",
  note: asset?.note ?? "",
});

/** The request body of the details (blank becomes null). */
export const assetBody = (values: AssetValues) => ({
  nameBn: values.nameBn,
  nameEn: values.nameEn || null,
  category: values.category,
  purchasedOn: values.purchasedOn || null,
  purchaseCost: values.purchaseCost || null,
  vendorId: values.vendorId || null,
  expenseVoucherNo: values.expenseVoucherNo || null,
  warrantyUntil: values.warrantyUntil || null,
  note: values.note || null,
});

/** Name, category (the ones in use suggested), purchase and warranty, and a note. */
export function AssetFields({ values, onChange, options }: { values: AssetValues; onChange: (values: AssetValues) => void; options: AssetOptions }) {
  const t = useTranslations("Assets");
  const listId = useId();
  const set = <K extends keyof AssetValues>(key: K, value: AssetValues[K]) => onChange({ ...values, [key]: value });
  // An archived vendor already set stays listed.
  const vendorOffered = values.vendorId === "" || options.vendors.some((vendor) => vendor.id === values.vendorId);

  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <TextField id="asset-name" label={t("nameBn")} hint={t("nameHint")} value={values.nameBn} onChange={(e) => set("nameBn", e.target.value)} required maxLength={100} />
      <TextField id="asset-name-en" label={t("nameEn")} hint={t("optional")} value={values.nameEn} onChange={(e) => set("nameEn", e.target.value)} lang="en" maxLength={100} />
      <TextField
        id="asset-category"
        label={t("category")}
        hint={t("categoryHint")}
        value={values.category}
        onChange={(e) => set("category", e.target.value)}
        list={listId}
        required
        maxLength={60}
      />
      <datalist id={listId}>
        {options.categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <TextField id="asset-purchased" label={t("purchasedOn")} hint={t("optional")} type="date" value={values.purchasedOn} onChange={(e) => set("purchasedOn", e.target.value)} />
      <TextField
        id="asset-cost"
        label={t("purchaseCost")}
        hint={t("optional")}
        inputMode="decimal"
        value={values.purchaseCost}
        onChange={(e) => set("purchaseCost", e.target.value)}
      />
      <Field label={t("vendor")} htmlFor="asset-vendor">
        <select id="asset-vendor" className={inputClass} value={values.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
          <option value="">{t("noVendor")}</option>
          {options.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
          {!vendorOffered ? <option value={values.vendorId}>{t("currentVendor")}</option> : null}
        </select>
      </Field>
      <TextField
        id="asset-voucher"
        label={t("voucherNo")}
        hint={t("voucherHint")}
        value={values.expenseVoucherNo}
        onChange={(e) => set("expenseVoucherNo", e.target.value)}
        maxLength={30}
        lang="en"
      />
      <TextField id="asset-warranty" label={t("warrantyUntil")} hint={t("optional")} type="date" value={values.warrantyUntil} onChange={(e) => set("warrantyUntil", e.target.value)} />
      <TextField id="asset-note" label={t("note")} hint={t("optional")} value={values.note} onChange={(e) => set("note", e.target.value)} maxLength={500} className="min-[600px]:col-span-2" />
    </div>
  );
}

/** Where an asset is kept: a facility in use, or a place in the tree. */
export type AssetPlaceValue = { facilityId: string } | { location: PickedPlace };

export const placeBody = (value: AssetPlaceValue) =>
  "facilityId" in value ? { facilityId: value.facilityId, locationId: null } : { facilityId: null, locationId: value.location?.id ?? null };

export const placeReady = (value: AssetPlaceValue) => ("facilityId" in value ? value.facilityId !== "" : value.location !== null);

export function AssetPlaceFields({ id, value, onChange, options }: { id: string; value: AssetPlaceValue; onChange: (value: AssetPlaceValue) => void; options: AssetOptions }) {
  const t = useTranslations("Assets");
  const locale = useLocale() as Locale;
  const atFacility = "facilityId" in value;

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("placeTitle")} className="flex flex-wrap gap-4 text-[13.5px]">
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={atFacility} onChange={() => onChange({ facilityId: options.facilities[0]?.id ?? "" })} className="accent-primary" />
          {t("atFacility")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={!atFacility} onChange={() => onChange({ location: null })} className="accent-primary" />
          {t("onPlace")}
        </label>
      </div>
      {atFacility ? (
        <Field label={t("facility")} htmlFor={`${id}-facility`}>
          <select id={`${id}-facility`} className={inputClass} value={value.facilityId} onChange={(e) => onChange({ facilityId: e.target.value })}>
            <option value="">{t("chooseFacility")}</option>
            {options.facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {pick(facility.name.bn, facility.name.en, locale)} · {facility.place}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <PlacePicker id={`${id}-place`} onChange={(location) => onChange({ location })} topWhenEmpty />
      )}
    </div>
  );
}

type Custodian = CustodianList["items"][number];

/**
 * The staff member who looks after the asset: search current staff the user may pick (posted in
 * or above their area) by name, designation or staff number. `initial` is the one already set.
 */
export function CustodianPicker({
  id,
  initial,
  onChange,
}: {
  id: string;
  initial: { id: string; name: string; nameEn: string | null; staffNo: number } | null;
  onChange: (staffId: string | null) => void;
}) {
  const t = useTranslations("Assets");
  const locale = useLocale() as Locale;
  const [chosen, setChosen] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Custodian[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (chosen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await api.GET("/assets/custodians", { params: { query: q.trim() ? { q: q.trim() } : {} } });
      if (cancelled) return;
      setFailed(!data);
      setResults(data?.items ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, chosen]);

  if (chosen) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <span className="font-semibold">{pick(chosen.name, chosen.nameEn, locale)}</span>
        <span className="num text-muted-foreground">{t("staffNo", { no: localDigits(chosen.staffNo, locale) })}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setChosen(null);
            onChange(null);
          }}
        >
          <X aria-hidden />
          {t("custodianClear")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Field label={t("custodianSearch")} htmlFor={id}>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id={id} className={`${inputClass} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("custodianPlaceholder")} />
        </div>
      </Field>
      {failed ? <p className="text-[12.5px] text-bad">{t("custodianFailed")}</p> : null}
      {results && results.length === 0 && !failed ? <p className="text-[12.5px] text-muted-foreground">{t("custodianNone")}</p> : null}
      {results && results.length > 0 ? (
        <ul className="grid gap-1">
          {results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-left text-[13.5px] hover:bg-surface-2"
                onClick={() => {
                  setChosen(row);
                  onChange(row.id);
                }}
              >
                <span className="font-semibold">{pick(row.name, row.nameEn, locale)}</span>{" "}
                <span className="text-muted-foreground">
                  · {pick(row.designation.bn, row.designation.en, locale)} · <span className="num">{t("staffNo", { no: localDigits(row.staffNo, locale) })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
