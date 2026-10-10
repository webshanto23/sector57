"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { albumInputSchema, localDigits, type AlbumAdmin, type Locale } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { CheckField, TextField } from "../fields";
import { useSave } from "../use-save";

type FormInput = z.input<typeof albumInputSchema>;
type FormOutput = z.output<typeof albumInputSchema>;

const blankToNull = (value: unknown) => (value === "" ? null : value);

/** Album title, event date and whether it is on the website. A new album opens its page after saving. */
export function AlbumForm({
  album,
  canSave,
  canDelete = false,
  onCancel,
}: {
  album?: AlbumAdmin;
  canSave: boolean;
  canDelete?: boolean;
  onCancel?: () => void;
}) {
  const t = useTranslations("Cms.gallery");
  const tAdmin = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, run } = useSave();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(albumInputSchema),
    defaultValues: {
      titleBn: album?.titleBn ?? "",
      titleEn: album?.titleEn ?? "",
      eventDate: album?.eventDate ?? null,
      isPublished: album?.isPublished ?? false,
    },
  });
  const errors = form.formState.errors;
  const id = (name: string) => `album-${album?.id ?? "new"}-${name}`;

  async function onSubmit(body: FormOutput) {
    const saved = await run(() =>
      album
        ? api.PUT("/gallery/albums/{id}", { params: { path: { id: album.id } }, body })
        : api.POST("/gallery/albums", { body }),
    );
    if (saved && !album) router.push(`/dashboard/website/gallery/${saved.id}`);
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3.5">
      <fieldset disabled={!canSave} className="grid gap-3.5 min-[701px]:grid-cols-2">
        <TextField id={id("titleBn")} label={t("titleBn")} error={errors.titleBn} {...form.register("titleBn")} />
        <TextField id={id("titleEn")} label={t("titleEn")} lang="en" error={errors.titleEn} {...form.register("titleEn")} />
        <TextField
          id={id("eventDate")}
          type="date"
          label={t("eventDate")}
          error={errors.eventDate}
          {...form.register("eventDate", { setValueAs: blankToNull })}
        />
        <div className="self-end pb-2">
          <CheckField id={id("isPublished")} label={t("isPublished")} hint={t("isPublishedHint")} {...form.register("isPublished")} />
        </div>
      </fieldset>
      <FormStatus status={status} />
      <div className="flex flex-wrap items-start gap-2.5">
        {canSave ? (
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? tAdmin("saving") : album ? t("save") : t("create")}
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
        {album && canDelete ? (
          <ConfirmButton
            label={t("delete")}
            question={t("confirmDelete", { count: localDigits(album.photoCount, locale) })}
            icon={Trash2}
            destructive
            onConfirm={async () => {
              const done = await run(() => api.DELETE("/gallery/albums/{id}", { params: { path: { id: album.id } } }));
              if (done !== undefined) router.push("/dashboard/website/gallery");
            }}
          />
        ) : null}
      </div>
    </form>
  );
}
