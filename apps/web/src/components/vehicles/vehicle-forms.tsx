"use client";

import type { VehicleDetail } from "@s57/shared";
import { ArrowRightLeft, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { HolderFields, vehicleBody, vehicleValues, VehicleFields, type Holder, type VehicleValues } from "./vehicle-fields";

/** A unit as the forms name it: its address and name. */
export type UnitLabel = { id: string; name: string };

/** A new vehicle: its details, then the unit and the person there it belongs to. Opens its page once saved. */
export function NewVehicleForm({ unit }: { unit: UnitLabel | null }) {
  const t = useTranslations("Vehicles");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<VehicleValues>(() => vehicleValues());
  const [holder, setHolder] = useState<Holder>({ unitId: unit?.id ?? null, personId: null });
  const ready = values.regNo.trim() !== "" && holder.unitId !== null && holder.personId !== null;

  async function save() {
    if (!holder.unitId || !holder.personId) return;
    const made = await run(() => api.POST("/vehicles", { body: { ...vehicleBody(values), unitId: holder.unitId!, personId: holder.personId! } }));
    if (made) router.push(`/dashboard/vehicles/${made.id}`);
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
        <VehicleFields id="vehicle" values={values} onChange={setValues} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("holderTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("holderHint")}</p>
        <HolderFields id="vehicle-holder" unit={unit} value={holder} onChange={setHolder} />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** The details of a vehicle on file, and the unit and person it belongs to. */
export function VehicleEditor({ vehicle, unit }: { vehicle: VehicleDetail; unit: UnitLabel }) {
  const t = useTranslations("Vehicles");
  const details = useSubmit();
  const owner = useSubmit();
  const [values, setValues] = useState<VehicleValues>(() => vehicleValues(vehicle));
  const [moving, setMoving] = useState(false);
  const [holder, setHolder] = useState<Holder>({ unitId: vehicle.place.id, personId: vehicle.person.id });
  const path = { params: { path: { id: vehicle.id } } };
  const unchanged = holder.unitId === vehicle.place.id && holder.personId === vehicle.person.id;

  return (
    <div className="grid content-start gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void details.run(() => api.PATCH("/vehicles/{id}", { ...path, body: vehicleBody(values) }));
          }}
        >
          <VehicleFields id="vehicle" values={values} onChange={setValues} />
          <Button type="submit" disabled={details.busy || !values.regNo.trim()} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        </form>
        <FormStatus status={details.status} />
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("holderTitle")}</h2>
        <HolderFields id="vehicle-holder" unit={moving ? null : unit} value={holder} onChange={setHolder} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={owner.busy || unchanged || !holder.unitId || !holder.personId}
            onClick={() => void owner.run(() => api.PATCH("/vehicles/{id}", { ...path, body: { unitId: holder.unitId!, personId: holder.personId! } }))}
          >
            <Save aria-hidden />
            {t("holderSave")}
          </Button>
          {!moving ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMoving(true);
                setHolder({ unitId: null, personId: null });
              }}
            >
              <ArrowRightLeft aria-hidden />
              {t("moveUnit")}
            </Button>
          ) : null}
        </div>
        <FormStatus status={owner.status} />
      </Card>
    </div>
  );
}

/** Removing a vehicle (sold, gone, or a mistake): asks why, then revokes its sticker and frees its slot. */
export function RemoveVehicleCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations("Vehicles");
  const { status, run } = useSubmit();
  const [reason, setReason] = useState("");

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("removeTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("removeHint")}</p>
      <TextField id="vehicle-remove-reason" label={t("removeReason")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      <div className="justify-self-start">
        <ConfirmButton
          label={t("remove")}
          question={t("removeConfirm", { regNo: vehicle.regNo })}
          icon={Trash2}
          destructive
          disabled={!reason.trim()}
          onConfirm={async () => {
            await run(() => api.POST("/vehicles/{id}/remove", { params: { path: { id: vehicle.id } }, body: { reason } }));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
