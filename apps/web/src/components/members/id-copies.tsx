"use client";

import {
  DOCUMENT_ACCEPT,
  DOCUMENT_UPLOAD,
  localDigits,
  MAX_LICENCE_PAGES,
  NID_SIDES,
  type IdCopy,
  type LicencePages,
  type Locale,
  type NidCopies,
} from "@s57/shared";
import { Camera, FilePlus, FileText, Trash2 } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { imageProblem, ImageUploadButton } from "@/components/cms/image-upload";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

type UploadProblem = `Admin.errors.${"unsupported_image" | "payload_too_large" | "unsupported_document"}` | "Documents.tooLarge";

/** Uploads files one after another; stops at the first refusal and reports it. `problem` gives the i18n key of a file the browser already knows is refused. */
function useUploads(problem: (file: File) => UploadProblem | null) {
  const tRoot = useTranslations();
  const router = useRouter();
  const submit = useSubmit();
  const [uploading, setUploading] = useState(false);

  async function upload(path: string, files: File[]) {
    submit.setStatus(null);
    const bad = files.map(problem).find(Boolean);
    if (bad) return submit.setStatus({ ok: false, text: tRoot(bad) });
    setUploading(true);
    try {
      for (const file of files) {
        const result = await uploadFile(path, file);
        if (!result.ok) return submit.setStatus({ ok: false, text: tRoot(errorMessageKey(result.error)) });
      }
      submit.setStatus({ ok: true, text: tRoot("Admin.saved") });
    } catch {
      submit.setStatus({ ok: false, text: tRoot("Admin.errors.network") });
    } finally {
      setUploading(false);
      router.refresh();
    }
  }

  return { ...submit, uploading, upload };
}

const photoProblem = (file: File): UploadProblem | null => {
  const problem = imageProblem(file);
  return problem ? `Admin.errors.${problem}` : null;
};

/** A copy's thumbnail (photos) or file icon (PDFs), opening the file in a new tab. */
function CopyPreview({ href, copy, label }: { href: string; copy: IdCopy; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="grid aspect-[1.6] place-items-center overflow-hidden rounded-[8px] border border-line bg-surface-2">
      {copy.kind === "image" ? (
        <Image src={href} alt={label} width={320} height={200} unoptimized className="size-full object-cover" />
      ) : (
        <span className="grid justify-items-center gap-1 text-muted-foreground">
          <FileText aria-hidden className="size-8" />
          <span className="text-[13px] font-semibold text-primary">{label}</span>
        </span>
      )}
    </a>
  );
}

/** Front and back of a person's NID, for those who may edit the person. */
export function NidCopiesCard({ personId, copies }: { personId: string; copies: NidCopies }) {
  const t = useTranslations("Members");
  const { status, busy, run, uploading, upload } = useUploads(photoProblem);
  const base = `/persons/${personId}`;

  return (
    <Card className="grid content-start gap-3">
      <div className="grid gap-0.5">
        <h2 className="text-[15px]">{t("nidCopy")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("idCopyPrivate")}</p>
      </div>
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        {NID_SIDES.map((side) => {
          const copy = copies[side];
          const label = t(side === "front" ? "nidFront" : "nidBack");
          return (
            <div key={side} className="grid content-start gap-2">
              <span className="text-[13px] font-semibold">{label}</span>
              {copy ? (
                <CopyPreview href={`/api${base}/id-copies/${copy.id}/file`} copy={copy} label={label} />
              ) : (
                <div className="grid aspect-[1.6] place-items-center rounded-[8px] border border-dashed border-line text-[13px] text-muted-foreground">
                  {t("noCopy")}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <ImageUploadButton
                  label={uploading ? t("uploading") : copy ? t("replaceCopy") : t("uploadCopy")}
                  icon={Camera}
                  disabled={uploading || busy}
                  onFiles={([file]) => file && void upload(`${base}/nid-copy/${side}`, [file])}
                />
                {copy ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading || busy}
                    onClick={() => void run(() => api.DELETE("/persons/{id}/nid-copy/{side}", { params: { path: { id: personId, side } } }))}
                  >
                    <Trash2 aria-hidden />
                    {t("removeCopy")}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

const documentProblem = (file: File): UploadProblem | null => {
  if (!(DOCUMENT_UPLOAD.types as readonly string[]).includes(file.type)) return "Admin.errors.unsupported_document";
  return file.size > DOCUMENT_UPLOAD.maxBytes ? "Documents.tooLarge" : null;
};

/** The pages of an organisation's trade licence (photos or PDFs), for those who may edit it. */
export function LicencePagesCard({ organisationId, pages }: { organisationId: string; pages: LicencePages }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const { status, setStatus, busy, run, uploading, upload } = useUploads(documentProblem);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const base = `/organisations/${organisationId}/licence-pages`;
  const room = MAX_LICENCE_PAGES - pages.items.length;

  function pick(files: File[]) {
    if (files.length > room) return setStatus({ ok: false, text: localDigits(t("licencePagesHint", { max: MAX_LICENCE_PAGES }), locale) });
    void upload(base, files);
  }

  return (
    <Card className="grid content-start gap-3">
      <div className="grid gap-0.5">
        <h2 className="text-[15px]">{t("licenceCopy")}</h2>
        <p className="text-[13px] text-muted-foreground">
          {localDigits(t("licencePagesHint", { max: MAX_LICENCE_PAGES }), locale)} {t("idCopyPrivate")}
        </p>
      </div>
      {pages.items.length > 0 ? (
        <ol className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[1100px]:grid-cols-5">
          {pages.items.map((page, index) => {
            const label = localDigits(t("licencePage", { n: index + 1 }), locale);
            return (
              <li key={page.id} className="grid content-start gap-1.5">
                <CopyPreview href={`/api${base}/${page.id}/file`} copy={page} label={label} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t("removeCopy")}: ${label}`}
                    disabled={uploading || busy}
                    onClick={() =>
                      void run(() => api.DELETE("/organisations/{id}/licence-pages/{docId}", { params: { path: { id: organisationId, docId: page.id } } }))
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground">{t("noLicencePages")}</p>
      )}
      {room > 0 ? (
        <div>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) pick(files);
            }}
          />
          <Button type="button" variant="outline" disabled={uploading || busy} onClick={() => input.current?.click()}>
            <FilePlus aria-hidden />
            {uploading ? t("uploading") : t("addLicencePage")}
          </Button>
        </div>
      ) : null}
      <FormStatus status={status} />
    </Card>
  );
}
