"use client";

import { localDigits, type Locale, type Party, type Tenancy } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { Field, inputClass } from "@/components/kit";

/** The unit's past renters, newest first, each once (their latest tenancy). */
export function pastRenters(tenancies: Tenancy[]): (Tenancy & { renter: Party })[] {
  const latest = new Map<string, Tenancy & { renter: Party }>();
  const ended = tenancies
    .filter((row): row is Tenancy & { renter: Party } => row.status === "ended" && row.renter !== null)
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate));
  for (const row of ended) if (!latest.has(row.renter.id)) latest.set(row.renter.id, row);
  return [...latest.values()];
}

/** A dropdown of past renters; empty value means a new renter typed on the form. */
export function PastRenterSelect({
  rows,
  value,
  onChange,
}: {
  rows: (Tenancy & { renter: Party })[];
  value: string;
  onChange: (row: (Tenancy & { renter: Party }) | null) => void;
}) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  return (
    <Field label={t("people.pastRenter")} htmlFor="renter-past">
      <select id="renter-past" className={inputClass} value={value} onChange={(e) => onChange(rows.find((row) => row.id === e.target.value) ?? null)}>
        <option value="">{t("people.pastRenterNew")}</option>
        {rows.map((row) => {
          const name = locale === "en" ? (row.renter.nameEn ?? row.renter.name) : row.renter.name;
          const phone = row.renter.phone ? ` · ${localDigits(row.renter.phone, locale)}` : "";
          const dates = ` · ${localDigits(row.startDate, locale)} – ${localDigits(row.endDate ?? "", locale)}`;
          return (
            <option key={row.id} value={row.id}>
              {name}
              {phone}
              {dates}
            </option>
          );
        })}
      </select>
      <p className="text-[12.5px] text-muted-foreground">{t("people.pastRenterHint")}</p>
    </Field>
  );
}
