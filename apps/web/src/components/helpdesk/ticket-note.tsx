"use client";

import { TICKET_PHOTO_LIMIT, localDigits, type Locale, type TicketDetail } from "@s57/shared";
import { Camera, MessageSquare } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus } from "@/components/admin/form-status";
import { TextAreaField } from "@/components/cms/fields";
import { imageProblem, ImageUploadButton } from "@/components/cms/image-upload";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

/** The mockup's "Add photo or comment": a note on the timeline, or a photo (up to five per ticket). */
export function TicketNoteCard({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("Helpdesk");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload([file]: File[]) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setStatus({ ok: false, text: tRoot(`Admin.errors.${problem}`) });
    setUploading(true);
    const result = await uploadFile(`/tickets/${ticket.id}/photos`, file);
    setUploading(false);
    if (!result.ok) return setStatus({ ok: false, text: tRoot(errorMessageKey(result.error)) });
    setStatus({ ok: true, text: tRoot("Admin.saved") });
    router.refresh();
  }

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("addNote")}</h2>
      <TextAreaField id="ticket-comment" label={t("comment")} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !note.trim()}
          onClick={() =>
            void run(() => api.POST("/tickets/{id}/comments", { params: { path: { id: ticket.id } }, body: { note } })).then((done) => {
              if (done) setNote("");
            })
          }
        >
          <MessageSquare aria-hidden />
          {t("commentSave")}
        </Button>
        {ticket.can.photo ? (
          <ImageUploadButton label={uploading ? t("uploading") : t("addPhoto")} icon={Camera} disabled={uploading} onFiles={upload} />
        ) : (
          <p className="self-center text-[12.5px] text-muted-foreground">{t("photoLimit", { count: localDigits(TICKET_PHOTO_LIMIT, locale) })}</p>
        )}
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
