"use client";

import { CERTIFICATE_TIES, pick, tiedForCertificate, type CertificateType, type Locale, type VehicleUnitPeople } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PlacePicker } from "@/components/forms/place-picker";
import { Field, inputClass } from "@/components/kit";
import { api } from "@/lib/api/client";

type People = VehicleUnitPeople["items"];

/** Who owns, rents or lives in the unit now; null while loading, "failed" when out of reach. */
function useUnitPeople(unitId: string | null): People | null | "failed" {
  const [people, setPeople] = useState<{ unitId: string; items: People | "failed" } | null>(null);
  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    void api
      .GET("/certificates/unit-people", { params: { query: { unitId } } })
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
 * The unit a certificate is about (picked from the tree, or fixed) and the person it is for.
 * People whose tie to the unit doesn't fit the type (a renter for a sale NOC) are shown but
 * can't be chosen; the API checks again.
 */
export function HolderFields({
  id,
  type,
  unit,
  value,
  onChange,
}: {
  id: string;
  type: CertificateType;
  /** A unit already chosen (the page's, or a draft's); null shows the place picker. */
  unit: { id: string; name: string } | null;
  value: Holder;
  onChange: (value: Holder) => void;
}) {
  const t = useTranslations("Certificates");
  const locale = useLocale() as Locale;
  const people = useUnitPeople(value.unitId);
  const eligible = people && people !== "failed" ? people.filter((person) => tiedForCertificate(type, person.ties)) : [];

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
      ) : eligible.length === 0 ? (
        <p className="text-[13px] text-warn">{t("nobodyFits", { ties: CERTIFICATE_TIES[type].map((tie) => t(`tie.${tie}`)).join(", ") })}</p>
      ) : (
        <Field label={t("person")} htmlFor={`${id}-person`}>
          <select id={`${id}-person`} className={inputClass} value={value.personId ?? ""} onChange={(e) => onChange({ ...value, personId: e.target.value || null })}>
            <option value="">{t("choosePerson")}</option>
            {people.map((person) => {
              const fits = tiedForCertificate(type, person.ties);
              return (
                <option key={person.id} value={person.id} disabled={!fits}>
                  {pick(person.name, person.nameEn, locale)} ({person.ties.map((tie) => t(`tie.${tie}`)).join(", ")}){fits ? "" : ` — ${t("notEligible")}`}
                </option>
              );
            })}
          </select>
        </Field>
      )}
    </div>
  );
}
