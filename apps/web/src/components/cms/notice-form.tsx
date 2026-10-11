"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { NOTICE_CATEGORIES, noticeInputSchema, type NoticeAdmin } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { DHAKA_INPUT, fromDhakaInput, toDhakaInput } from "@/lib/dhaka-time";
import { CheckField, FieldMessage, SectionTitle, TextAreaField, TextField } from "./fields";
import { useSave } from "./use-save";

// The form edits the publish time as a Dhaka `datetime-local` value; it becomes an instant on submit.
const formSchema = noticeInputSchema.extend({ publishAt: z.string().regex(DHAKA_INPUT) });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/**
 * Add or edit a notice: Bangla (required) and English (optional) title and body,
 * category, whether it shows on the website, and when. A future time schedules it.
 */
export function NoticeForm({
  notice,
  canSave,
  canDelete = false,
}: {
  notice?: NoticeAdmin;
  canSave: boolean;
  canDelete?: boolean;
}) {
  const t = useTranslations("Cms.notices");
  const tCat = useTranslations("Notices.category");
  const tAdmin = useTranslations("Admin");
  const router = useRouter();
  const { status, run } = useSave();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titleBn: notice?.titleBn ?? "",
      titleEn: notice?.titleEn ?? "",
      bodyBn: notice?.bodyBn ?? "",
      bodyEn: notice?.bodyEn ?? "",
      category: notice?.category ?? "general",
      isPublic: notice?.isPublic ?? true,
      publishAt: toDhakaInput(notice?.publishAt ?? new Date()),
    },
  });
  const errors = form.formState.errors;

  async function onSubmit(values: FormOutput) {
    const body = { ...values, publishAt: fromDhakaInput(values.publishAt) };
    const saved = await run(() =>
      notice ? api.PUT("/notices/{id}", { params: { path: { id: notice.id } }, body }) : api.POST("/notices", { body }),
    );
    if (saved && !notice) router.push(`/dashboard/notices/${saved.id}`);
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid gap-3.5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <fieldset disabled={!canSave} className="grid content-start gap-3.5">
        <Card className="grid gap-3.5">
          <SectionTitle title={t("bangla")} />
          <TextField id="notice-titleBn" label={t("title")} error={errors.titleBn} {...form.register("titleBn")} />
          <TextAreaField id="notice-bodyBn" label={t("body")} rows={10} error={errors.bodyBn} {...form.register("bodyBn")} />
        </Card>
        <Card className="grid gap-3.5">
          <SectionTitle title={t("english")} sub={t("englishSub")} />
          <TextField id="notice-titleEn" label={t("title")} lang="en" error={errors.titleEn} {...form.register("titleEn")} />
          <TextAreaField
            id="notice-bodyEn"
            label={t("body")}
            lang="en"
            rows={8}
            error={errors.bodyEn}
            {...form.register("bodyEn")}
          />
        </Card>
      </fieldset>

      <div className="grid content-start gap-3.5">
        <Card className="grid gap-3.5">
          <fieldset disabled={!canSave} className="grid gap-3.5">
            <Field label={t("category")} htmlFor="notice-category">
              <select id="notice-category" className={inputClass} {...form.register("category")}>
                {NOTICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {tCat(category)}
                  </option>
                ))}
              </select>
            </Field>
            <CheckField id="notice-isPublic" label={t("isPublic")} hint={t("isPublicHint")} {...form.register("isPublic")} />
            <div className="grid gap-[5px]">
              <Field label={t("publishAt")} htmlFor="notice-publishAt">
                <input
                  id="notice-publishAt"
                  type="datetime-local"
                  className={inputClass}
                  aria-describedby="notice-publishAt-hint"
                  aria-invalid={errors.publishAt ? true : undefined}
                  {...form.register("publishAt")}
                />
              </Field>
              <p id="notice-publishAt-hint" className="text-[12.5px] text-muted-foreground">
                {t("publishAtHint")}
              </p>
              <FieldMessage id="notice-publishAt" error={errors.publishAt} />
            </div>
          </fieldset>
          <FormStatus status={status} />
          {canSave ? (
            <Button type="submit" disabled={form.formState.isSubmitting} className="justify-self-start">
              {form.formState.isSubmitting ? tAdmin("saving") : notice ? t("save") : t("create")}
            </Button>
          ) : null}
        </Card>

        {notice && canDelete ? (
          <ConfirmButton
            label={t("delete")}
            question={t("confirmDelete")}
            icon={Trash2}
            destructive
            onConfirm={async () => {
              const done = await run(() => api.DELETE("/notices/{id}", { params: { path: { id: notice.id } } }));
              if (done !== undefined) router.push("/dashboard/notices");
            }}
          />
        ) : null}
      </div>
    </form>
  );
}
