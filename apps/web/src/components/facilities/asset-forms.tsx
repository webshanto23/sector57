"use client";

import { isAssetGone, type AssetDetail, type AssetOptions, type AssetStatus } from "@s57/shared";
import { Camera, ImageOff, MapPin, Save } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { imageProblem, ImageUploadButton } from "@/components/cms/image-upload";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";
import { AssetFields, AssetPlaceFields, assetBody, assetValues, CustodianPicker, placeBody, placeReady, type AssetPlaceValue, type AssetValues } from "./asset-fields";

/** A new asset: details, where it is kept and who looks after it. Opens its page once saved. */
export function NewAssetForm({ options, facilityId }: { options: AssetOptions; facilityId: string | null }) {
  const t = useTranslations("Assets");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<AssetValues>(() => assetValues());
  const [place, setPlace] = useState<AssetPlaceValue>(() =>
    facilityId || options.facilities.length > 0 ? { facilityId: facilityId ?? options.facilities[0]!.id } : { location: null },
  );
  const [custodian, setCustodian] = useState<string | null>(null);
  const ready = values.nameBn.trim() !== "" && values.category.trim() !== "" && placeReady(place);

  async function save() {
    const made = await run(() => api.POST("/assets", { body: { ...assetBody(values), place: placeBody(place), custodianStaffId: custodian } }));
    if (made) router.push(`/dashboard/facilities/assets/${made.id}`);
  }

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <AssetFields values={values} onChange={setValues} options={options} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("placeTitle")}</h2>
        <AssetPlaceFields id="asset-place" value={place} onChange={setPlace} options={options} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("custodian")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("custodianHint")}</p>
        <CustodianPicker id="asset-custodian" initial={null} onChange={setCustodian} />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** The details, place and custodian of an asset in use or under repair. */
export function AssetEditor({ asset, options }: { asset: AssetDetail; options: AssetOptions }) {
  const t = useTranslations("Assets");
  const details = useSubmit();
  const move = useSubmit();
  const keeper = useSubmit();
  const [values, setValues] = useState<AssetValues>(() => assetValues(asset));
  const [place, setPlace] = useState<AssetPlaceValue>(() => (asset.facility ? { facilityId: asset.facility.id } : { location: null }));
  const path = { params: { path: { id: asset.id } } };
  const samePlace = "facilityId" in place ? place.facilityId === asset.facility?.id : place.location?.id === asset.place.id && !asset.facility;

  return (
    <div className="grid content-start gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void details.run(() => api.PATCH("/assets/{id}", { ...path, body: assetBody(values) }));
          }}
        >
          <AssetFields values={values} onChange={setValues} options={options} />
          <Button type="submit" disabled={details.busy || !values.nameBn.trim() || !values.category.trim()} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        </form>
        <FormStatus status={details.status} />
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("moveTitle")}</h2>
        <AssetPlaceFields id="asset-move" value={place} onChange={setPlace} options={options} />
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={move.busy || !placeReady(place) || samePlace}
          onClick={() => void move.run(() => api.PATCH("/assets/{id}", { ...path, body: { place: placeBody(place) } }))}
        >
          <MapPin aria-hidden />
          {t("moveSave")}
        </Button>
        <FormStatus status={move.status} />
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("custodian")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("custodianHint")}</p>
        <CustodianPicker
          id="asset-custodian"
          initial={asset.custodian}
          onChange={(staffId) => void keeper.run(() => api.PATCH("/assets/{id}", { ...path, body: { custodianStaffId: staffId } }))}
        />
        <FormStatus status={keeper.status} />
      </Card>
    </div>
  );
}

/** The status changes the user may make: repair and back with edit rights; retire, lose or restore with approval. */
export function StatusCard({ asset, today }: { asset: AssetDetail; today: string }) {
  const t = useTranslations("Assets");
  const { status, busy, run } = useSubmit();
  const [to, setTo] = useState<AssetStatus>(asset.can.statuses[0]!);
  const [on, setOn] = useState(today);
  const [reason, setReason] = useState("");
  const gone = isAssetGone(to);

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("statusTitle")}</h2>
      <Field label={t("statusTo")} htmlFor="asset-status">
        <select id="asset-status" className={inputClass} value={to} onChange={(e) => setTo(e.target.value as AssetStatus)}>
          {asset.can.statuses.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </select>
      </Field>
      {gone ? <TextField id="asset-status-on" label={t("statusOn")} type="date" max={today} value={on} onChange={(e) => setOn(e.target.value)} /> : null}
      <TextField
        id="asset-status-reason"
        label={gone ? t("statusReason") : t("statusNote")}
        hint={gone ? undefined : t("optional")}
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      {gone ? <p className="text-[12.5px] text-muted-foreground">{t("goneHint")}</p> : null}
      <Button
        type="button"
        variant={gone ? "destructive" : "outline"}
        className="justify-self-start"
        disabled={busy || (gone && (!on || !reason.trim()))}
        onClick={() =>
          void run(() =>
            api.POST("/assets/{id}/status", { params: { path: { id: asset.id } }, body: { status: to, on: gone ? on : null, reason: reason || null } }),
          )
        }
      >
        {t("statusSave")}
      </Button>
      <FormStatus status={status} />
    </Card>
  );
}

/** The asset's photo: add, change or remove (while it may be edited). */
export function PhotoCard({ asset }: { asset: AssetDetail }) {
  const t = useTranslations("Assets");
  const tRoot = useTranslations();
  const router = useRouter();
  const { status, setStatus, run } = useSubmit();
  const [uploading, setUploading] = useState(false);

  async function upload([file]: File[]) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setStatus({ ok: false, text: tRoot(`Admin.errors.${problem}`) });
    setUploading(true);
    const result = await uploadFile(`/assets/${asset.id}/photo`, file);
    setUploading(false);
    if (!result.ok) return setStatus({ ok: false, text: tRoot(errorMessageKey(result.error)) });
    setStatus({ ok: true, text: tRoot("Admin.saved") });
    router.refresh();
  }

  return (
    <Card className="grid gap-2.5">
      <h2 className="text-[15px]">{t("photo")}</h2>
      {asset.photoUrl ? <Image src={asset.photoUrl} alt="" width={480} height={320} unoptimized className="h-auto w-full max-w-[480px] rounded-lg object-cover" /> : null}
      {asset.can.edit ? (
        <div className="flex flex-wrap gap-2">
          <ImageUploadButton label={uploading ? t("uploading") : asset.photoUrl ? t("changePhoto") : t("addPhoto")} icon={Camera} disabled={uploading} onFiles={upload} />
          {asset.photoUrl ? (
            <Button type="button" variant="outline" onClick={() => void run(() => api.DELETE("/assets/{id}/photo", { params: { path: { id: asset.id } } }))}>
              <ImageOff aria-hidden />
              {t("removePhoto")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}
