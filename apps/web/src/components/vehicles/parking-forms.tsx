"use client";

import type { ParkingSlot, VehicleRow } from "@s57/shared";
import { MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/** A new slot: where it is (any place: a building's garage, a road), its code and a note. Opens its page once saved. */
export function NewSlotForm() {
  const t = useTranslations("Vehicles.parking");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [place, setPlace] = useState<PickedPlace>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  async function save() {
    if (!place) return;
    const made = await run(() => api.POST("/parking", { body: { locationId: place.id, code, note: note.trim() || null } }));
    if (made) router.push(`/dashboard/vehicles/parking/${made.id}`);
  }

  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("newTitle")}</h2>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <PlacePicker id="slot-place" onChange={setPlace} />
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <TextField id="slot-code" label={t("code")} hint={t("codeHint")} value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
          <TextField id="slot-note" label={t("note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !place || !code.trim()} className="justify-self-start">
          <Plus aria-hidden />
          {t("create")}
        </Button>
      </form>
      <FormStatus status={status} />
    </Card>
  );
}

/** A slot's code and note, and moving it to another place. */
export function SlotEditor({ slot }: { slot: ParkingSlot }) {
  const t = useTranslations("Vehicles.parking");
  const details = useSubmit();
  const move = useSubmit();
  const [code, setCode] = useState(slot.code);
  const [note, setNote] = useState(slot.note ?? "");
  const [place, setPlace] = useState<PickedPlace>(null);
  const path = { params: { path: { id: slot.id } } };

  return (
    <div className="grid content-start gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void details.run(() => api.PATCH("/parking/{id}", { ...path, body: { code, note: note.trim() || null } }));
          }}
        >
          <div className="grid gap-3.5 min-[600px]:grid-cols-2">
            <TextField id="slot-code" label={t("code")} value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
            <TextField id="slot-note" label={t("note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={details.busy || !code.trim()} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        </form>
        <FormStatus status={details.status} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("moveTitle")}</h2>
        <PlacePicker id="slot-move" onChange={setPlace} />
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={move.busy || !place || place.id === slot.place.id}
          onClick={() => place && void move.run(() => api.PATCH("/parking/{id}", { ...path, body: { locationId: place.id } }))}
        >
          <MapPin aria-hidden />
          {t("moveSave")}
        </Button>
        <FormStatus status={move.status} />
      </Card>
    </div>
  );
}

type Target = "none" | "unit" | "vehicle";

/** Who holds the slot: a unit, one vehicle (found by its number), or nobody. */
export function AssignCard({ slot }: { slot: ParkingSlot }) {
  const t = useTranslations("Vehicles.parking");
  const tVehicles = useTranslations("Vehicles");
  const { status, busy, run } = useSubmit();
  const [target, setTarget] = useState<Target>(slot.assignee?.kind ?? "unit");
  const [unit, setUnit] = useState<PickedPlace>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<VehicleRow[] | null>(null);
  const [vehicleId, setVehicleId] = useState("");

  async function find() {
    const { data } = await api.GET("/vehicles", { params: { query: { q, pageSize: 10 } } });
    setFound(data?.items ?? []);
    setVehicleId(data?.items[0]?.id ?? "");
  }

  const body =
    target === "unit" ? (unit?.isUnit ? { unitId: unit.id, vehicleId: null } : null) : target === "vehicle" ? (vehicleId ? { unitId: null, vehicleId } : null) : { unitId: null, vehicleId: null };

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("assignTitle")}</h2>
      <div role="radiogroup" aria-label={t("assignTitle")} className="flex flex-wrap gap-4 text-[13.5px]">
        {(["unit", "vehicle", "none"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="slot-target" className="accent-primary" checked={target === value} onChange={() => setTarget(value)} />
            {t(`target.${value}`)}
          </label>
        ))}
      </div>
      {target === "unit" ? (
        <>
          <PlacePicker id="slot-unit" onChange={setUnit} />
          {unit && !unit.isUnit ? <p className="text-[13px] text-muted-foreground">{t("pickUnit")}</p> : null}
        </>
      ) : target === "vehicle" ? (
        <div className="grid gap-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <TextField id="slot-vehicle-q" label={t("findVehicle")} value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} />
            <Button type="button" variant="outline" disabled={q.trim().length < 2} onClick={() => void find()}>
              <Search aria-hidden />
              {t("find")}
            </Button>
          </div>
          {found === null ? null : found.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("noVehicle")}</p>
          ) : (
            <Field label={t("vehicle")} htmlFor="slot-vehicle">
              <select id="slot-vehicle" className={inputClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {found.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.regNo} · {tVehicles(`kind.${row.kind}`)} · {[...row.place.address, row.place.name].join(", ")}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      ) : null}
      <Button
        type="button"
        className="justify-self-start"
        disabled={busy || !body || (target === "none" && !slot.assignee)}
        onClick={() => body && void run(() => api.POST("/parking/{id}/assign", { params: { path: { id: slot.id } }, body }))}
      >
        <Save aria-hidden />
        {target === "none" ? t("free") : t("assign")}
      </Button>
      <FormStatus status={status} />
    </Card>
  );
}

/** Taking a slot out of use; it is kept on file. */
export function RemoveSlotButton({ slot }: { slot: ParkingSlot }) {
  const t = useTranslations("Vehicles.parking");
  const { status, run } = useSubmit();
  return (
    <div className="grid gap-2">
      <ConfirmButton
        label={t("remove")}
        question={t("removeConfirm", { code: slot.code })}
        icon={Trash2}
        destructive
        onConfirm={async () => {
          await run(() => api.POST("/parking/{id}/remove", { params: { path: { id: slot.id } } }));
        }}
      />
      <FormStatus status={status} />
    </div>
  );
}
