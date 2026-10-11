"use client";

import {
  COMMITTEE_POSITIONS,
  committeeSeatCreateSchema,
  committeeSeatUpdateSchema,
  isCommitteePosition,
  type CommitteeSeat,
  type CommitteeSeatCreateInput,
} from "@s57/shared";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { FormStatus } from "@/components/admin/form-status";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { FieldMessage, TextField } from "../fields";
import { apiIssues, setIssues, zodIssues } from "../issues";
import { useSave } from "../use-save";

const CUSTOM = "custom";

type FormValues = {
  nameBn: string;
  nameEn: string;
  phone: string;
  positionKey: string;
  customPosition: string;
  sortOrder: string;
  termStart: string;
  termEnd: string;
};

/**
 * Add a committee member, or edit one seat. The position is a standard key or a
 * custom title. On edit the names change the linked person; the phone is fixed.
 */
export function SeatForm({
  seat,
  defaults,
  onDone,
}: {
  seat?: CommitteeSeat;
  /** Starting term and order for a new seat (the current term, next position). */
  defaults?: { termStart: string; termEnd: string | null; sortOrder: number };
  onDone: () => void;
}) {
  const t = useTranslations("Cms.committee");
  const tPos = useTranslations("Committee.position");
  const tAdmin = useTranslations("Admin");
  const { status, setStatus, run } = useSave();
  const custom = seat ? !isCommitteePosition(seat.position) : false;
  const form = useForm<FormValues>({
    defaultValues: {
      nameBn: seat?.nameBn ?? "",
      nameEn: seat?.nameEn ?? "",
      phone: "",
      positionKey: seat ? (custom ? CUSTOM : seat.position) : "executive_member",
      customPosition: custom ? seat!.position : "",
      sortOrder: String(seat?.sortOrder ?? defaults?.sortOrder ?? 0),
      termStart: seat?.termStart ?? defaults?.termStart ?? "",
      termEnd: seat?.termEnd ?? defaults?.termEnd ?? "",
    },
  });
  const errors = form.formState.errors;
  const positionKey = useWatch({ control: form.control, name: "positionKey" });
  const id = (name: string) => `seat-${seat?.id ?? "new"}-${name}`;
  const rename = { position: positionKey === CUSTOM ? "customPosition" : "positionKey" };

  async function onSubmit(values: FormValues) {
    setStatus(null);
    const payload = {
      nameBn: values.nameBn,
      nameEn: values.nameEn,
      position: values.positionKey === CUSTOM ? values.customPosition : values.positionKey,
      sortOrder: values.sortOrder,
      termStart: values.termStart,
      termEnd: values.termEnd || null,
      ...(seat ? {} : { phone: values.phone }),
    };
    const parsed = (seat ? committeeSeatUpdateSchema : committeeSeatCreateSchema).safeParse(payload);
    if (!parsed.success) {
      setIssues(form.setError, zodIssues(parsed.error), rename);
      return;
    }
    const body = parsed.data as CommitteeSeatCreateInput;
    let invalid: unknown;
    const saved = await run(async () => {
      const result = seat
        ? await api.PUT("/committee/members/{id}", { params: { path: { id: seat.id } }, body })
        : await api.POST("/committee/members", { body });
      if (result.response.status === 400) invalid = result.error;
      return result;
    });
    if (invalid) setIssues(form.setError, apiIssues(invalid), rename);
    if (saved) onDone();
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3.5">
      <div className="grid gap-3.5 min-[701px]:grid-cols-2">
        <TextField id={id("nameBn")} label={t("nameBn")} error={errors.nameBn} {...form.register("nameBn")} />
        <TextField id={id("nameEn")} label={t("nameEn")} lang="en" error={errors.nameEn} {...form.register("nameEn")} />
        {seat ? null : (
          <TextField
            id={id("phone")}
            type="tel"
            inputMode="tel"
            label={t("phone")}
            hint={t("phoneHint")}
            error={errors.phone}
            {...form.register("phone")}
          />
        )}
        <div>
          <Field label={t("position")} htmlFor={id("positionKey")}>
            <select id={id("positionKey")} className={inputClass} {...form.register("positionKey")}>
              {COMMITTEE_POSITIONS.map((key) => (
                <option key={key} value={key}>
                  {tPos(key)}
                </option>
              ))}
              <option value={CUSTOM}>{t("customPosition")}</option>
            </select>
          </Field>
          <FieldMessage id={id("positionKey")} error={errors.positionKey} />
        </div>
        {positionKey === CUSTOM ? (
          <TextField
            id={id("customPosition")}
            label={t("customPositionLabel")}
            error={errors.customPosition}
            {...form.register("customPosition")}
          />
        ) : null}
        <TextField
          id={id("sortOrder")}
          type="number"
          min={0}
          max={999}
          label={t("sortOrder")}
          hint={t("sortOrderHint")}
          error={errors.sortOrder}
          {...form.register("sortOrder")}
        />
        <TextField id={id("termStart")} type="date" label={t("termStart")} error={errors.termStart} {...form.register("termStart")} />
        <TextField
          id={id("termEnd")}
          type="date"
          label={t("termEnd")}
          hint={t("termEndHint")}
          error={errors.termEnd}
          {...form.register("termEnd")}
        />
      </div>
      <FormStatus status={status} />
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? tAdmin("saving") : seat ? t("save") : t("add")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
