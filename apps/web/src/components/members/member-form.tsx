"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TextField } from "@/components/cms/fields";
import { FormStatus } from "@/components/admin/form-status";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { emptyPerson, PersonFields, personBody, type PersonValues } from "./person-fields";

/**
 * The office adds a society member directly: a person (matched by phone or NID, else added) or an
 * organisation (matched by trade licence, else name), the place and the day they joined. Opens
 * their page once saved. `nidRequired`: the society requires an NID or trade licence of members.
 */
export function NewMemberForm({ nidRequired }: { nidRequired: boolean }) {
  const t = useTranslations("Members");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [kind, setKind] = useState<"person" | "organisation">("person");
  const [values, setValues] = useState<PersonValues>(emptyPerson);
  const [organisation, setOrganisation] = useState({ name: "", tradeLicence: "" });
  const ready =
    kind === "person"
      ? values.fullName.trim() !== "" && (!nidRequired || values.nid.trim() !== "")
      : organisation.name.trim() !== "" && (!nidRequired || organisation.tradeLicence.trim() !== "");
  const [place, setPlace] = useState<PickedPlace>(null);
  const [joinedOn, setJoinedOn] = useState("");

  return (
    <Card>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const party = kind === "person" ? { person: personBody(values) } : { organisation };
          const created = await run(() => api.POST("/memberships", { body: { ...party, locationId: place?.id ?? null, joinedOn } }));
          if (created?.personId) router.push(`/dashboard/members/${created.personId}`);
          else if (created?.organisationId) router.push(`/dashboard/members/organisations/${created.organisationId}`);
        }}
      >
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1.5 text-[13px] font-semibold">{t("people.partyKind")}</legend>
          {(["person", "organisation"] as const).map((option) => (
            <label key={option} className="inline-flex items-center gap-2 text-[13.5px]">
              <input type="radio" name="new-member-kind" checked={kind === option} onChange={() => setKind(option)} />
              {t(option === "person" ? "people.kindPerson" : "people.kindOrganisation")}
            </label>
          ))}
        </fieldset>
        {kind === "person" ? (
          <PersonFields id="new-member" values={values} onChange={setValues} nidRequired={nidRequired} />
        ) : (
          <div className="grid gap-3.5 min-[600px]:grid-cols-2">
            <TextField
              id="new-member-org"
              label={t("orgName")}
              value={organisation.name}
              onChange={(e) => setOrganisation({ ...organisation, name: e.target.value })}
              required
            />
            <TextField
              id="new-member-licence"
              label={t("tradeLicence")}
              hint={t(nidRequired ? "tradeLicenceRequired" : "optional")}
              value={organisation.tradeLicence}
              onChange={(e) => setOrganisation({ ...organisation, tradeLicence: e.target.value })}
              required={nidRequired}
            />
          </div>
        )}
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <div className="grid gap-1.5">
            <p className="text-[13px] font-medium">{t("memberPlace")}</p>
            <PlacePicker id="new-member-place" onChange={setPlace} />
          </div>
          <TextField
            id="new-member-joined"
            label={t("joinedOn")}
            hint={t("joinedOnHint")}
            type="date"
            value={joinedOn}
            onChange={(e) => setJoinedOn(e.target.value)}
          />
        </div>
        <FormStatus status={status} />
        <Button type="submit" disabled={busy || !ready} className="justify-self-start">
          {t("create")}
        </Button>
      </form>
    </Card>
  );
}
