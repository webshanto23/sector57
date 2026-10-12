"use client";

import type { StaffDetail } from "@s57/shared";
import { DoorOpen, MapPin, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Card } from "@/components/kit";
import { PersonFields, personBody, type PersonValues } from "@/components/members/person-fields";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { JobFields, type JobValues } from "./staff-fields";

const personValues = (staff: StaffDetail): PersonValues => ({
  fullName: staff.personDetail.fullName,
  fullNameEn: staff.personDetail.fullNameEn ?? "",
  phone: staff.personDetail.phone ?? "",
  email: staff.personDetail.email ?? "",
  nid: staff.personDetail.nid ?? "",
  dateOfBirth: staff.personDetail.dateOfBirth ?? "",
  gender: staff.personDetail.gender ?? "",
});

/** The job, the post and (when allowed) the person's own details of a current stint. */
export function StaffEditor({ staff }: { staff: StaffDetail }) {
  const t = useTranslations("Staff");
  const job = useSubmit();
  const person = useSubmit();
  const move = useSubmit();
  const [values, setValues] = useState<JobValues>({
    designationBn: staff.designation.bn,
    designationEn: staff.designation.en ?? "",
    kind: staff.kind,
    joinedOn: staff.joinedOn,
    pay: staff.pay ?? "",
  });
  const [details, setDetails] = useState<PersonValues>(() => personValues(staff));
  const [post, setPost] = useState<PickedPlace>(null);
  const path = { params: { path: { id: staff.id } } };

  return (
    <div className="grid content-start gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("job")}</h2>
        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void job.run(() =>
              api.PATCH("/staff/{id}", {
                ...path,
                body: {
                  designationBn: values.designationBn,
                  designationEn: values.designationEn || null,
                  kind: values.kind,
                  joinedOn: values.joinedOn,
                  ...(staff.can.pay ? { pay: values.pay || null } : {}),
                },
              }),
            );
          }}
        >
          <JobFields id="staff-job" values={values} onChange={setValues} withPay={staff.can.pay} />
          <Button type="submit" disabled={job.busy || !values.designationBn.trim()} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        </form>
        <FormStatus status={job.status} />
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("moveTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("moveHint")}</p>
        <PlacePicker id="staff-move" onChange={setPost} />
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={move.busy || !post || post.id === staff.posted.id}
          onClick={() => post && void move.run(() => api.PATCH("/staff/{id}", { ...path, body: { postedLocationId: post.id } }))}
        >
          <MapPin aria-hidden />
          {t("moveSave")}
        </Button>
        <FormStatus status={move.status} />
      </Card>

      {staff.can.editPerson ? (
        <Card className="grid gap-3.5">
          <h2 className="text-[15px]">{t("person")}</h2>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void person.run(() => api.PATCH("/staff/{id}", { ...path, body: { person: personBody(details) } }));
            }}
          >
            <PersonFields id="staff-person" values={details} onChange={setDetails} />
            <Button type="submit" disabled={person.busy || !details.fullName.trim()} className="justify-self-start">
              <Save aria-hidden />
              {t("save")}
            </Button>
          </form>
          <FormStatus status={person.status} />
        </Card>
      ) : null}
    </div>
  );
}

/** The last working day and why; afterwards the stint is read-only. */
export function LeaveCard({ staff, today }: { staff: StaffDetail; today: string }) {
  const t = useTranslations("Staff");
  const { status, run } = useSubmit();
  const [leftOn, setLeftOn] = useState(today);
  const [reason, setReason] = useState("");

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("leaveTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("leaveHint")}</p>
      <div className="grid gap-3 min-[600px]:grid-cols-[200px_1fr]">
        <TextField id="staff-left-on" label={t("leftOn")} type="date" value={leftOn} min={staff.joinedOn} max={today} onChange={(e) => setLeftOn(e.target.value)} />
        <TextField id="staff-left-reason" label={t("leftReason")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <ConfirmButton
          label={t("leave")}
          question={t("leaveQuestion")}
          icon={DoorOpen}
          destructive
          disabled={!leftOn || !reason.trim()}
          onConfirm={async () => {
            await run(() => api.POST("/staff/{id}/leave", { params: { path: { id: staff.id } }, body: { leftOn, reason } }), t("leftNow"));
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

/** A new stint for someone who left, from a day after they left; opens it once made. */
export function RejoinCard({ staff, today }: { staff: StaffDetail; today: string }) {
  const t = useTranslations("Staff");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [joinedOn, setJoinedOn] = useState(staff.leftOn && today > staff.leftOn ? today : "");

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("rejoinTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("rejoinHint")}</p>
      <TextField id="staff-rejoin" label={t("joinedOn")} type="date" className="max-w-[220px]" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={busy || !joinedOn}
        onClick={async () => {
          const made = await run(() => api.POST("/staff/{id}/rejoin", { params: { path: { id: staff.id } }, body: { joinedOn } }));
          if (made) router.push(`/dashboard/hrm/${made.id}`);
        }}
      >
        <RotateCcw aria-hidden />
        {t("rejoin")}
      </Button>
      <FormStatus status={status} />
    </Card>
  );
}
