"use client";

import { TIME_ZONE } from "@s57/shared";
import { CalendarX, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { TextField } from "@/components/cms/fields";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { emptyPerson, PersonFields, personBody, type PersonValues } from "./person-fields";

/** Today in Dhaka as `YYYY-MM-DD`, the default for start and end dates. */
export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

export type PartyValues = { kind: "person" | "organisation"; person: PersonValues; name: string; tradeLicence: string };
export const emptyParty: PartyValues = { kind: "person", person: emptyPerson, name: "", tradeLicence: "" };

/** The request body for an owner or renter. */
export const partyBody = (values: PartyValues) =>
  values.kind === "person"
    ? ({ kind: "person", person: personBody(values.person) } as const)
    : ({ kind: "organisation", organisation: { name: values.name, tradeLicence: values.tradeLicence } } as const);

export const partyReady = (values: PartyValues) => (values.kind === "person" ? values.person.fullName.trim() : values.name.trim()) !== "";

/** A person or an organisation, as typed. The API finds an existing one or adds a new one. */
export function PartyFields({ id, values, onChange }: { id: string; values: PartyValues; onChange: (values: PartyValues) => void }) {
  const t = useTranslations("Members");
  return (
    <div className="grid gap-3.5">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1.5 text-[13px] font-semibold">{t("people.partyKind")}</legend>
        {(["person", "organisation"] as const).map((kind) => (
          <label key={kind} className="inline-flex items-center gap-2 text-[13.5px]">
            <input type="radio" name={`${id}-kind`} checked={values.kind === kind} onChange={() => onChange({ ...values, kind })} />
            {t(kind === "person" ? "people.kindPerson" : "people.kindOrganisation")}
          </label>
        ))}
      </fieldset>
      {values.kind === "person" ? (
        <PersonFields id={`${id}-person`} values={values.person} onChange={(person) => onChange({ ...values, person })} short />
      ) : (
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <TextField id={`${id}-org`} label={t("orgName")} value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} required />
          <TextField
            id={`${id}-licence`}
            label={t("tradeLicence")}
            hint={t("optional")}
            value={values.tradeLicence}
            onChange={(e) => onChange({ ...values, tradeLicence: e.target.value })}
          />
        </div>
      )}
      <p className="text-[12.5px] text-muted-foreground">{t("people.reuseHint")}</p>
    </div>
  );
}

/** A date input with a label. */
export function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} required />
    </Field>
  );
}

/** "End" opens a date and a confirm button; "Delete" asks once. Either may be left out. */
export function RowActions({
  canEnd,
  canDelete,
  disabled,
  onEnd,
  onDelete,
}: {
  canEnd: boolean;
  canDelete: boolean;
  disabled: boolean;
  onEnd: (endDate: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const t = useTranslations("Members.people");
  const id = useId();
  const [ending, setEnding] = useState<string | null>(null);

  if (ending !== null) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <DateField id={`${id}-end`} label={t("endDate")} value={ending} onChange={setEnding} />
        <Button
          type="button"
          size="sm"
          disabled={disabled || !ending}
          onClick={async () => {
            await onEnd(ending);
            setEnding(null);
          }}
        >
          {t("confirmEnd")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEnding(null)}>
          {t("cancel")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {canEnd ? (
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setEnding(todayIso())}>
          <CalendarX aria-hidden />
          {t("end")}
        </Button>
      ) : null}
      {canDelete ? (
        <ConfirmButton
          label={t("deleteRow")}
          question={t("confirmDeleteRow")}
          icon={Trash2}
          destructive
          disabled={disabled}
          onConfirm={async () => {
            await onDelete();
          }}
        />
      ) : null}
    </div>
  );
}
