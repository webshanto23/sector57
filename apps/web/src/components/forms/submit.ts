import { DOCUMENT_UPLOAD, FORM_HONEYPOT, formEntrySchema, formReceiptSchema, type FormEntry, type FormKey, type FormReceipt } from "@s57/shared";
import { uploadFile } from "@/lib/api/upload";

/** `id` is set when the office typed it in (the new application's page). */
export type SubmitResult =
  | { ok: true; receipt: FormReceipt | FormEntry }
  | { ok: false; code: string | null; issues: { path: string; message: string }[] };

/** How a form is sent: from the public website, or by the office from the dashboard. */
export type FormSender = (formKey: FormKey, data: unknown, file: File | null, honeypot: string) => Promise<SubmitResult>;

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

/**
 * The office types in an application from the dashboard: `POST /forms/:formKey`, logged in with
 * the CSRF header. The answers and the file are the same as on the website; there is no honeypot.
 */
export const enterForm: FormSender = async (formKey, data, file) => {
  try {
    const result = await uploadFile<unknown>(`/forms/${formKey}`, file, { data: JSON.stringify(data) });
    if (result.ok) {
      const entry = formEntrySchema.safeParse(result.data);
      if (entry.success) return { ok: true, receipt: entry.data };
      return { ok: false, code: null, issues: [] };
    }
    const error = (result.error ?? {}) as { code?: unknown; issues?: unknown };
    const issues = Array.isArray(error.issues) ? (error.issues as { path: string; message: string }[]) : [];
    return { ok: false, code: typeof error.code === "string" ? error.code : null, issues };
  } catch {
    return { ok: false, code: "network", issues: [] };
  }
};
