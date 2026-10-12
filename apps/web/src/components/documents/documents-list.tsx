"use client";

import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES,
  DOCUMENT_UPLOAD,
  formatDate,
  type Document,
  type DocumentEntity,
  type DocumentList,
  type DocumentType,
  type Locale,
} from "@s57/shared";
import { Archive, ArchiveRestore, FileText, Image as ImageIcon, Pencil, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus, type Status } from "@/components/admin/form-status";
import { Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

/**
 * Documents of the society, a person or a place: each opens through the permission-checked API
 * route (photos in the browser, PDFs as a download). Those who may edit rename and archive;
 * those who may add upload a photo or PDF with a title and a type.
 */
export function DocumentsList({
  list,
  entityType,
  entityId,
  archived = false,
}: {
  list: DocumentList;
  entityType: DocumentEntity;
  entityId?: string;
  archived?: boolean;
}) {
  const t = useTranslations("Documents");
  return (
    <div className="grid gap-3">
      {list.items.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">{archived ? t("noneArchived") : t("none")}</p>
      ) : (
        <ul className="grid gap-2">
          {list.items.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} entityType={entityType} canEdit={list.can.edit} />
          ))}
        </ul>
      )}
      {list.can.create && !archived ? <UploadForm entityType={entityType} entityId={entityId} /> : null}
    </div>
  );
}

function DocumentRow({ doc, entityType, canEdit }: { doc: Document; entityType: DocumentEntity; canEdit: boolean }) {
  const t = useTranslations("Documents");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [docType, setDocType] = useState<DocumentType>(doc.docType);
  const path = { params: { path: { id: doc.id } } };
  const Icon = doc.kind === "image" ? ImageIcon : FileText;

  return (
    <li className="grid gap-2 rounded-[8px] border border-line px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden className="size-4 flex-none text-muted-foreground" />
        <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener" className="min-w-0 flex-1 font-semibold break-words text-primary">
          {doc.title}
        </a>
        <span className="text-[12px] text-muted-foreground">
          {[t(`type.${doc.docType}`), doc.uploadedBy?.name, formatDate(doc.uploadedAt, locale, "short")].filter(Boolean).join(" · ")}
        </span>
        {canEdit ? (
          <span className="flex gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing((open) => !open)}>
              {editing ? <X aria-hidden /> : <Pencil aria-hidden />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={doc.archivedAt ? t("restore") : t("archive")}
              title={doc.archivedAt ? t("restore") : t("archive")}
              onClick={() =>
                void run(
                  () => (doc.archivedAt ? api.POST("/documents/{id}/restore", path) : api.POST("/documents/{id}/archive", path)),
                  doc.archivedAt ? t("restored") : t("archived"),
                )
              }
            >
              {doc.archivedAt ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            </Button>
          </span>
        ) : null}
      </div>
      {doc.archivedAt ? (
        <p className="text-[12px] text-muted-foreground">
          {t("archivedBy", { name: doc.archivedBy?.name ?? "—", date: formatDate(doc.archivedAt, locale, "short") })}
        </p>
      ) : null}
      {editing ? (
        <form
          className="grid gap-2 min-[600px]:grid-cols-[1fr_180px_auto] min-[600px]:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await run(() => api.PATCH("/documents/{id}", { ...path, body: { title, docType } }));
            if (done) setEditing(false);
          }}
        >
          <Field label={t("title")} htmlFor={`doc-title-${doc.id}`}>
            <input id={`doc-title-${doc.id}`} className={inputClass} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <TypeSelect id={`doc-type-${doc.id}`} entityType={entityType} value={docType} onChange={setDocType} />
          <Button type="submit" disabled={busy || title.trim() === ""}>
            {t("save")}
          </Button>
        </form>
      ) : null}
      <FormStatus status={status} />
    </li>
  );
}

function TypeSelect({ id, entityType, value, onChange }: { id: string; entityType: DocumentEntity; value: DocumentType; onChange: (value: DocumentType) => void }) {
  const t = useTranslations("Documents");
  return (
    <Field label={t("docType")} htmlFor={id}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as DocumentType)}>
        {DOCUMENT_TYPES[entityType].map((type) => (
          <option key={type} value={type}>
            {t(`type.${type}`)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function UploadForm({ entityType, entityId }: { entityType: DocumentEntity; entityId?: string }) {
  const t = useTranslations("Documents");
  const tAll = useTranslations();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>(DOCUMENT_TYPES[entityType][0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const prefix = `doc-new-${entityType}`;

  async function submit() {
    if (!file) return;
    if (file.size > DOCUMENT_UPLOAD.maxBytes) {
      setStatus({ ok: false, text: t("tooLarge") });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const fields: Record<string, string> = { entityType, docType, title };
      if (entityId) fields["entityId"] = entityId;
      const result = await uploadFile<Document>("/documents", file, fields);
      if (result.ok) {
        setStatus({ ok: true, text: t("added") });
        setTitle("");
        setFile(null);
        if (input.current) input.current.value = "";
        router.refresh();
      } else {
        setStatus({ ok: false, text: tAll(errorMessageKey(result.error)) });
      }
    } catch {
      setStatus({ ok: false, text: tAll("Admin.errors.network") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-2.5 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="text-[14px] font-semibold">{t("add")}</h3>
      <div className="grid gap-2.5 min-[600px]:grid-cols-[1fr_200px]">
        <Field label={t("title")} htmlFor={`${prefix}-title`}>
          <input id={`${prefix}-title`} className={inputClass} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <TypeSelect id={`${prefix}-type`} entityType={entityType} value={docType} onChange={setDocType} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={input}
          id={`${prefix}-file`}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          <Upload aria-hidden />
          {file ? file.name : t("chooseFile")}
        </Button>
        <Button type="submit" disabled={busy || !file || title.trim() === ""}>
          {busy ? t("uploading") : t("upload")}
        </Button>
        <span className="text-[12px] text-muted-foreground">{t("fileHint")}</span>
      </div>
      <FormStatus status={status} />
    </form>
  );
}
