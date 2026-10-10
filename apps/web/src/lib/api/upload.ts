import { CSRF_HEADER } from "@s57/shared";
import { csrfToken, refreshSession } from "./client";

export type UploadResult<T> = { ok: true; data: T } | { ok: false; status: number; error: unknown };

/**
 * Sends one file as multipart form data to an API path (`/committee/members/…/photo`)
 * through the same-origin `/api` proxy, with the CSRF header. After a 401 it refreshes
 * the session once and retries, like the typed client. The browser sets the multipart
 * boundary itself, so no Content-Type is given.
 */
export async function uploadFile<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<UploadResult<T>> {
  const send = () => {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.append(name, value);
    body.append("file", file);
    return fetch(`/api${path}`, { method: "POST", body, headers: { [CSRF_HEADER]: csrfToken() } });
  };

  let response = await send();
  if (response.status === 401 && (await refreshSession())) response = await send();
  const body: unknown = await response.json().catch(() => undefined);
  return response.ok ? { ok: true, data: body as T } : { ok: false, status: response.status, error: body };
}
