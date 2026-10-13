"use client";

import { pick, VEHICLE_KINDS, type Locale, type VehicleDetail, type VehicleKind, type VehicleUnitPeople } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TextAreaField, TextField } from "@/components/cms/fields";
import { PlacePicker } from "@/components/forms/place-picker";
import { Field, inputClass } from "@/components/kit";
import { api } from "@/lib/api/client";

export type VehicleValues = { regNo: string; kind: VehicleKind; make: string; colour: string; note: string };

export const vehicleValues = (vehicle?: VehicleDetail): VehicleValues => ({
  regNo: vehicle?.regNo ?? "",
  kind: vehicle?.kind ?? "car",
  make: vehicle?.make ?? "",
  colour: vehicle?.colour ?? "",
  note: vehicle?.note ?? "",
});

/** The body for `POST`/`PATCH /vehicles` (empty optional text clears it). */
export const vehicleBody = (values: VehicleValues) => ({
  regNo: values.regNo,
  kind: values.kind,
  make: values.make.trim() || null,
  colour: values.colour.trim() || null,
  note: values.note.trim() || null,
});

/** The registration number, kind, make, colour and note. */
export function VehicleFields({ id, values, onChange }: { id: string; values: VehicleValues; onChange: (values: VehicleValues) => void }) {
  const t = useTranslations("Vehicles");
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField
          id={`${id}-reg`}
          label={t("regNo")}
          hint={t("regNoHint")}
          value={values.regNo}
          maxLength={40}
          onChange={(e) => onChange({ ...values, regNo: e.target.value })}
        />
        <Field label={t("kindLabel")} htmlFor={`${id}-kind`}>
          <select id={`${id}-kind`} className={inputClass} value={values.kind} onChange={(e) => onChange({ ...values, kind: e.target.value as VehicleKind })}>
            {VEHICLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </option>
            ))}
          </select>
        </Field>
        <TextField id={`${id}-make`} label={t("make")} hint={t("optional")} value={values.make} maxLength={60} onChange={(e) => onChange({ ...values, make: e.target.value })} />
        <TextField id={`${id}-colour`} label={t("colour")} hint={t("optional")} value={values.colour} maxLength={40} onChange={(e) => onChange({ ...values, colour: e.target.value })} />
      </div>
      <TextAreaField id={`${id}-note`} label={t("note")} value={values.note} maxLength={500} rows={2} onChange={(e) => onChange({ ...values, note: e.target.value })} />
    </div>
  );
}

type People = VehicleUnitPeople["items"];

/** Who may own a vehicle at the unit (its owners, renters and residents now); null while loading, "failed" when out of reach. */
function useUnitPeople(unitId: string | null): People | null | "failed" {
  const [people, setPeople] = useState<{ unitId: string; items: People | "failed" } | null>(null);
  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    void api
      .GET("/vehicles/unit-people", { params: { query: { unitId } } })
      .then(({ data }) => !cancelled && setPeople({ unitId, items: data?.items ?? "failed" }))
      .catch(() => !cancelled && setPeople({ unitId, items: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [unitId]);
  return unitId && people?.unitId === unitId ? people.items : null;
}

export type Holder = { unitId: string | null; personId: string | null };

/**
 * The unit a vehicle belongs to (picked from the tree, or fixed with its name shown) and the
 * person there it belongs to: only someone who owns, rents or lives in the unit now.
 */
export function HolderFields({
  id,
  unit,
  value,
  onChange,
}: {
  id: string;
  /** A unit already chosen (the vehicle's own, or the page's); null shows the place picker. */
  unit: { id: string; name: string } | null;
  value: Holder;
  onChange: (value: Holder) => void;
}) {
  const t = useTranslations("Vehicles");
  const locale = useLocale() as Locale;
  const people = useUnitPeople(value.unitId);

  return (
    <div className="grid gap-3.5">
      {unit ? (
        <p className="text-[13.5px]">{t("atUnit", { unit: unit.name })}</p>
      ) : (
        <PlacePicker id={`${id}-place`} onChange={(place) => onChange({ unitId: place?.isUnit ? place.id : null, personId: null })} />
      )}
      {!value.unitId ? (
        unit ? null : <p className="text-[13px] text-muted-foreground">{t("pickUnit")}</p>
      ) : people === "failed" ? (
        <p className="text-[13px] text-bad">{t("peopleFailed")}</p>
      ) : people === null ? (
        <p className="text-[13px] text-muted-foreground">{t("loading")}</p>
      ) : people.length === 0 ? (
        <p className="text-[13px] text-warn">{t("nobodyAtUnit")}</p>
      ) : (
        <Field label={t("person")} htmlFor={`${id}-person`}>
          <select id={`${id}-person`} className={inputClass} value={value.personId ?? ""} onChange={(e) => onChange({ ...value, personId: e.target.value || null })}>
            <option value="">{t("choosePerson")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {pick(person.name, person.nameEn, locale)} ({person.ties.map((tie) => t(`tie.${tie}`)).join(", ")})
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
