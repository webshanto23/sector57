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
 * The office adds a society member directly: the person (matched by phone or NID, else added),
 * their place and the day they joined. Opens the person's page once saved.
 */
/** `nidRequired`: the society requires an NID of members. */
export function NewMemberForm({ nidRequired }: { nidRequired: boolean }) {
  const t = useTranslations("Members");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<PersonValues>(emptyPerson);
  const [place, setPlace] = useState<PickedPlace>(null);
  const [joinedOn, setJoinedOn] = useState("");

  return (
    <Card>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const created = await run(() =>
            api.POST("/memberships", { body: { person: personBody(values), locationId: place?.id ?? null, joinedOn } }),
          );
          if (created) router.push(`/dashboard/members/${created.personId}`);
        }}
      >
        <PersonFields id="new-member" values={values} onChange={setValues} nidRequired={nidRequired} />
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
        <Button type="submit" disabled={busy || !values.fullName.trim() || (nidRequired && !values.nid.trim())} className="justify-self-start">
          {t("create")}
        </Button>
      </form>
    </Card>
  );
}
