"use client";

import { DOCUMENT_ACCEPT, DOCUMENT_UPLOAD, formatDate, type ExpenseDetail, type Locale } from "@s57/shared";
import { FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus, type Status } from "@/components/admin/form-status";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

/**
 * The bills and cash memos behind an expense, as photos or PDFs. Files open through the
 * permission-checked API route, never a public URL. Wrong ones can be removed until the
 * expense is paid; after that they stay, though a late bill can still be added.
 */
export function VouchersPanel({ expense }: { expense: ExpenseDetail }) {
  const t = useTranslations("Expenses.vouchers");
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Status>(null);
  const { status, busy, run } = useSubmit();
  const removable = expense.can.upload && (expense.status === "pending" || expense.status === "approved");

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > DOCUMENT_UPLOAD.maxBytes) {
      setUploadStatus({ ok: false, text: t("tooLarge") });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      const result = await uploadFile<ExpenseDetail>(`/expenses/${expense.id}/vouchers`, file);
      setUploadStatus(result.ok ? { ok: true, text: t("added") } : { ok: false, text: tAll(errorMessageKey(result.error)) });
      if (result.ok) router.refresh();
    } catch {
      setUploadStatus({ ok: false, text: tAll("Admin.errors.network") });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("title")}</h2>
      {expense.vouchers.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-2">
          {expense.vouchers.map((voucher) => (
            <li key={voucher.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line px-3 py-2">
              {voucher.isImage ? <ImageIcon aria-hidden className="size-4 text-muted-foreground" /> : <FileText aria-hidden className="size-4 text-muted-foreground" />}
              <a href={`/api/expenses/${expense.id}/vouchers/${voucher.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 font-semibold text-primary">
                {voucher.fileName}
              </a>
              <span className="text-[12px] text-muted-foreground">
                {[voucher.uploadedBy, formatDate(voucher.uploadedAt, locale, "short")].filter(Boolean).join(" · ")}
              </span>
              {removable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={t("remove")}
                  title={t("remove")}
                  onClick={() =>
                    void run(() => api.POST("/expenses/{id}/vouchers/{documentId}/remove", { params: { path: { id: expense.id, documentId: voucher.id } } }), t("removed"))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {expense.can.upload ? (
        <div className="grid gap-1.5">
          <input ref={input} type="file" accept={DOCUMENT_ACCEPT} className="sr-only" id="voucher-file" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button type="button" variant="outline" className="justify-self-start" disabled={uploading} onClick={() => input.current?.click()}>
            <Upload aria-hidden />
            {uploading ? t("uploading") : t("add")}
          </Button>
          <p className="text-[12.5px] text-muted-foreground">{t("hint")}</p>
        </div>
      ) : null}
      <FormStatus status={uploadStatus ?? status} />
    </Card>
  );
}
