"use client";

import type { StaffCreateInput } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Card } from "@/components/kit";
import { emptyPerson, PersonFields, personBody, type PersonValues } from "@/components/members/person-fields";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { JobFields, type JobValues } from "./staff-fields";

/**
 * A new staff member: the person (someone on file with the same phone or NID is reused, keeping
 * their stored details), the job and where they are posted. Opens their page once saved.
 */
export function NewStaffForm({ today, withPay }: { today: string; withPay: boolean }) {
  const t = useTranslations("Staff");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [person, setPerson] = useState<PersonValues>(emptyPerson);
  const [job, setJob] = useState<JobValues>({ designationBn: "", designationEn: "", kind: "permanent", joinedOn: today, pay: "" });
  const [post, setPost] = useState<PickedPlace>(null);
  const ready = person.fullName.trim() !== "" && job.designationBn.trim() !== "" && job.joinedOn !== "" && post !== null;

  async function save() {
    if (!post) return;
    const body: StaffCreateInput = {
      person: personBody(person) as StaffCreateInput["person"],
      designationBn: job.designationBn,
      designationEn: job.designationEn || null,
      kind: job.kind,
      postedLocationId: post.id,
      joinedOn: job.joinedOn,
      pay: withPay ? job.pay || null : null,
    };
    const made = await run(() => api.POST("/staff", { body }));
    if (made) router.push(`/dashboard/hrm/${made.id}`);
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
        <h2 className="text-[15px]">{t("person")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("personHint")}</p>
        <PersonFields id="staff-person" values={person} onChange={setPerson} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("job")}</h2>
        <JobFields id="staff-job" values={job} onChange={setJob} withPay={withPay} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("postedAt")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("postedHint")}</p>
        <PlacePicker id="staff-post" onChange={setPost} topWhenEmpty />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}
