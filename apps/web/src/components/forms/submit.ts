import { DOCUMENT_UPLOAD, FORM_HONEYPOT, formReceiptSchema, type FormKey, type FormReceipt } from "@s57/shared";

export type SubmitResult =
  | { ok: true; receipt: FormReceipt }
  | { ok: false; code: string | null; issues: { path: string; message: string }[] };

/** The API error code a document would get, checked in the browser first; null when it may be sent. */
export function documentProblem(file: File): "fileWrongType" | "fileTooLarge" | null {
  if (!(DOCUMENT_UPLOAD.types as readonly string[]).includes(file.type)) return "fileWrongType";
  if (file.size > DOCUMENT_UPLOAD.maxBytes) return "fileTooLarge";
  return null;
}

/**
 * Posts a public form as multipart data through the same-origin `/api` proxy: the answers as
 * JSON in `data`, the attachment in `file`, and the honeypot field the visitor never sees.
 * No login and no CSRF token: the API checks the Origin instead.
 */
export async function submitForm(formKey: FormKey, data: unknown, file: File | null, honeypot: string): Promise<SubmitResult> {
  const body = new FormData();
  body.append("data", JSON.stringify(data));
  body.append(FORM_HONEYPOT, honeypot);
  if (file) body.append("file", file);
  try {
    const response = await fetch(`/api/public/forms/${formKey}`, { method: "POST", body });
    const json: unknown = await response.json().catch(() => undefined);
    if (response.ok) {
      const receipt = formReceiptSchema.safeParse(json);
      if (receipt.success) return { ok: true, receipt: receipt.data };
    }
    const error = (json ?? {}) as { code?: unknown; issues?: unknown };
    const code = typeof error.code === "string" ? error.code : response.status === 429 ? "too_many_requests" : null;
    const issues = Array.isArray(error.issues) ? (error.issues as { path: string; message: string }[]) : [];
    return { ok: false, code, issues };
  } catch {
    return { ok: false, code: "network", issues: [] };
  }
}
