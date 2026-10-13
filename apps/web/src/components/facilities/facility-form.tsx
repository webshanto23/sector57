"use client";

import { FACILITY_KINDS, pick, type FacilityDetail, type FacilityFunds, type FacilityKind, type Locale } from "@s57/shared";
import { Archive, ArchiveRestore, MapPin, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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

type Values = { nameBn: string; nameEn: string; kind: FacilityKind; bookable: boolean; fundId: string; note: string };

const valuesOf = (facility?: FacilityDetail): Values => ({
  nameBn: facility?.name.bn ?? "",
  nameEn: facility?.name.en ?? "",
  kind: facility?.kind ?? "hall",
  bookable: facility?.bookable ?? false,
  fundId: facility?.fund?.id ?? "",
  note: facility?.note ?? "",
});

/** Name, kind, bookable, its own fund (while separate funds are on) and a note. */
function FacilityFields({ values, onChange, funds }: { values: Values; onChange: (values: Values) => void; funds: FacilityFunds }) {
  const t = useTranslations("Facilities");
  const locale = useLocale() as Locale;
  const set = <K extends keyof Values>(key: K, value: Values[K]) => onChange({ ...values, [key]: value });
  // A fund already set stays listed even if it is no longer offered.
  const offered = funds.funds.some((fund) => fund.id === values.fundId) || values.fundId === "";

  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <TextField id="facility-name" label={t("nameBn")} hint={t("nameHint")} value={values.nameBn} onChange={(e) => set("nameBn", e.target.value)} required maxLength={100} />
      <TextField id="facility-name-en" label={t("nameEn")} hint={t("optional")} value={values.nameEn} onChange={(e) => set("nameEn", e.target.value)} lang="en" maxLength={100} />
      <Field label={t("kindLabel")} htmlFor="facility-kind">
        <select id="facility-kind" className={inputClass} value={values.kind} onChange={(e) => set("kind", e.target.value as FacilityKind)}>
          {FACILITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
      </Field>
      {funds.separateFunds ? (
        <Field label={t("fundLabel")} htmlFor="facility-fund">
          <select id="facility-fund" className={inputClass} value={values.fundId} onChange={(e) => set("fundId", e.target.value)}>
            <option value="">{t("noFund")}</option>
            {funds.funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {pick(fund.name.bn, fund.name.en, locale)}
              </option>
            ))}
            {!offered ? <option value={values.fundId}>{t("currentFund")}</option> : null}
          </select>
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-[13.5px] min-[600px]:col-span-2">
        <input type="checkbox" checked={values.bookable} onChange={(e) => set("bookable", e.target.checked)} className="size-4 accent-primary" />
        {t("bookableLabel")}
      </label>
      <TextField id="facility-note" label={t("note")} hint={t("optional")} value={values.note} onChange={(e) => set("note", e.target.value)} maxLength={500} className="min-[600px]:col-span-2" />
    </div>
  );
}

/** A new facility: its details and where it is. Opens its page once saved. */
export function NewFacilityForm({ funds }: { funds: FacilityFunds }) {
  const t = useTranslations("Facilities");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<Values>(() => valuesOf());
  const [place, setPlace] = useState<PickedPlace>(null);

  async function save() {
    if (!place) return;
    const made = await run(() =>
      api.POST("/facilities", {
        body: {
          locationId: place.id,
          nameBn: values.nameBn,
          nameEn: values.nameEn || null,
          kind: values.kind,
          bookable: values.bookable,
          fundId: values.fundId || null,
          note: values.note || null,
        },
      }),
    );
    if (made) router.push(`/dashboard/facilities/${made.id}`);
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
        <FacilityFields values={values} onChange={setValues} funds={funds} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("placeTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("placeHint")}</p>
        <PlacePicker id="facility-place" onChange={setPlace} topWhenEmpty />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !values.nameBn.trim() || !place} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** The details and place of a facility in use. */
export function FacilityEditor({ facility, funds }: { facility: FacilityDetail; funds: FacilityFunds }) {
  const t = useTranslations("Facilities");
  const details = useSubmit();
  const move = useSubmit();
  const [values, setValues] = useState<Values>(() => valuesOf(facility));
  const [place, setPlace] = useState<PickedPlace>(null);
  const path = { params: { path: { id: facility.id } } };

  return (
    <div className="grid content-start gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void details.run(() =>
              api.PATCH("/facilities/{id}", {
                ...path,
                body: {
                  nameBn: values.nameBn,
                  nameEn: values.nameEn || null,
                  kind: values.kind,
                  bookable: values.bookable,
                  note: values.note || null,
                  ...(funds.separateFunds ? { fundId: values.fundId || null } : {}),
                },
              }),
            );
          }}
        >
          <FacilityFields values={values} onChange={setValues} funds={funds} />
          <Button type="submit" disabled={details.busy || !values.nameBn.trim()} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        </form>
        <FormStatus status={details.status} />
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("moveTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("moveHint")}</p>
        <PlacePicker id="facility-move" onChange={setPlace} />
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={move.busy || !place || place.id === facility.place.id}
          onClick={() => place && void move.run(() => api.PATCH("/facilities/{id}", { ...path, body: { locationId: place.id } }))}
        >
          <MapPin aria-hidden />
          {t("moveSave")}
        </Button>
        <FormStatus status={move.status} />
      </Card>
    </div>
  );
}

/** Archive a facility (once nothing in use is kept there) or bring it back. */
export function ArchiveCard({ facility }: { facility: FacilityDetail }) {
  const t = useTranslations("Facilities");
  const { status, run } = useSubmit();
  const archived = facility.archivedAt !== null;
  const path = { params: { path: { id: facility.id } } };

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{archived ? t("restoreTitle") : t("archiveTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{archived ? t("restoreHint") : t("archiveHint")}</p>
      <div>
        {archived ? (
          <Button type="button" variant="outline" onClick={() => void run(() => api.POST("/facilities/{id}/restore", path), t("restored"))}>
            <ArchiveRestore aria-hidden />
            {t("restore")}
          </Button>
        ) : (
          <ConfirmButton
            label={t("archive")}
            question={t("archiveQuestion")}
            icon={Archive}
            destructive
            onConfirm={async () => {
              await run(() => api.POST("/facilities/{id}/archive", path), t("archivedNow"));
            }}
          />
        )}
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
