"use client";

import { localDigits, MAX_ALBUM_PHOTOS, type AlbumAdmin, type Locale, type PhotoAdmin } from "@s57/shared";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { Card, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";
import { imageProblem, ImageUploadButton } from "../image-upload";
import { useSave } from "../use-save";

export type GalleryPermissions = { create: boolean; edit: boolean; delete: boolean };

/**
 * An album's photos: upload several at once (sent one by one, so a phone on a slow
 * line shows progress and one bad file doesn't sink the rest), captions, order, delete.
 * The first photo is the album cover.
 */
export function PhotoManager({ album, can }: { album: AlbumAdmin; can: GalleryPermissions }) {
  const t = useTranslations("Cms.gallery");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const { status, setStatus, run, afterChange } = useSave();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const photos = album.photos;
  const room = MAX_ALBUM_PHOTOS - photos.length;

  async function upload(files: File[]) {
    setStatus(null);
    const batch = files.slice(0, room);
    const failed: string[] = [];
    setProgress({ done: 0, total: batch.length });
    for (const [index, file] of batch.entries()) {
      const problem = imageProblem(file);
      if (problem) {
        failed.push(`${file.name}: ${tAll(`Admin.errors.${problem}`)}`);
      } else {
        try {
          const result = await uploadFile<PhotoAdmin>(`/gallery/albums/${album.id}/photos`, file);
          if (!result.ok) failed.push(`${file.name}: ${tAll(errorMessageKey(result.error))}`);
        } catch {
          failed.push(`${file.name}: ${tAll("Admin.errors.network")}`);
        }
      }
      setProgress({ done: index + 1, total: batch.length });
    }
    setProgress(null);
    const added = batch.length - failed.length;
    if (files.length > batch.length) failed.push(t("tooMany", { max: localDigits(MAX_ALBUM_PHOTOS, locale) }));
    if (added > 0) await afterChange(t("uploaded", { count: localDigits(added, locale) }));
    if (failed.length > 0) setStatus({ ok: false, text: failed.join(" · ") });
  }

  function move(from: number, to: number) {
    const ids = photos.map((photo) => photo.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    return run(() => api.PUT("/gallery/albums/{id}/photo-order", { params: { path: { id: album.id } }, body: { photoIds: ids } }));
  }

  return (
    <Card className="grid gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-[15px]">{t("photos")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("photosSub")}</p>
        </div>
        {can.create ? (
          <ImageUploadButton
            label={progress ? t("uploadingN", { done: localDigits(progress.done, locale), total: localDigits(progress.total, locale) }) : t("upload")}
            icon={ImagePlus}
            variant="default"
            multiple
            disabled={progress !== null || room <= 0}
            onFiles={upload}
          />
        ) : null}
      </div>
      <div aria-live="polite">
        <FormStatus status={status} />
      </div>

      {photos.length === 0 ? (
        <p className="text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <ol className="grid grid-cols-1 gap-3 min-[381px]:grid-cols-2 min-[900px]:grid-cols-3 min-[1300px]:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <PhotoCard
                photo={photo}
                index={index}
                count={photos.length}
                can={can}
                onMove={(to) => move(index, to)}
                onDelete={() => run(() => api.DELETE("/gallery/photos/{id}", { params: { path: { id: photo.id } } }))}
              />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function PhotoCard({
  photo,
  index,
  count,
  can,
  onMove,
  onDelete,
}: {
  photo: PhotoAdmin;
  index: number;
  count: number;
  can: GalleryPermissions;
  onMove: (to: number) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const t = useTranslations("Cms.gallery");
  const locale = useLocale() as Locale;
  const { status, run } = useSave();
  const [captionBn, setCaptionBn] = useState(photo.captionBn ?? "");
  const [captionEn, setCaptionEn] = useState(photo.captionEn ?? "");
  const n = localDigits(index + 1, locale);
  const changed = captionBn !== (photo.captionBn ?? "") || captionEn !== (photo.captionEn ?? "");
  const src = photo.thumbUrl ?? photo.url;

  return (
    <div className="grid gap-2 rounded-[10px] border border-line bg-surface-2 p-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-surface">
        {src ? (
          <Image src={src} alt={photo.captionBn ?? t("photoN", { n })} fill unoptimized sizes="300px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-xs text-muted-foreground">{t("noPreview")}</span>
        )}
        {index === 0 ? (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            {t("cover")}
          </span>
        ) : null}
      </div>
      {can.edit ? (
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => api.PATCH("/gallery/photos/{id}", { params: { path: { id: photo.id } }, body: { captionBn, captionEn } }));
          }}
        >
          <input
            value={captionBn}
            onChange={(event) => setCaptionBn(event.target.value)}
            maxLength={300}
            placeholder={t("captionBn")}
            aria-label={t("captionBnFor", { n })}
            className={`${inputClass} py-1.5 text-[13px]`}
          />
          <input
            value={captionEn}
            onChange={(event) => setCaptionEn(event.target.value)}
            maxLength={300}
            lang="en"
            placeholder={t("captionEn")}
            aria-label={t("captionEnFor", { n })}
            className={`${inputClass} py-1.5 text-[13px]`}
          />
          {changed ? (
            <Button type="submit" size="sm" className="justify-self-start">
              {t("saveCaption")}
            </Button>
          ) : null}
        </form>
      ) : photo.captionBn ? (
        <p className="text-[13px]">{photo.captionBn}</p>
      ) : null}
      <FormStatus status={status} />
      <div className="flex flex-wrap gap-1.5">
        {can.edit ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
              aria-label={t("moveEarlier", { n })}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
              aria-label={t("moveLater", { n })}
            >
              <ArrowRight aria-hidden />
            </Button>
          </>
        ) : null}
        {can.delete ? (
          <ConfirmButton
            label={t("deletePhoto")}
            question={t("confirmDeletePhoto")}
            icon={Trash2}
            destructive
            onConfirm={async () => {
              await onDelete();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
