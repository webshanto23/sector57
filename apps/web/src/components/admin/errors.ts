/** API error codes the admin screens explain; anything else shows the generic error. */
const KNOWN = [
  "beyond_your_permissions",
  "system_role_protected",
  "role_name_taken",
  "role_in_use",
  "cannot_change_self",
  "last_admin",
  "phone_taken",
  "invalid_assignment",
  "validation_failed",
  "unsupported_image",
  "file_required",
  "payload_too_large",
  "album_full",
  "invalid_order",
] as const;
type KnownCode = (typeof KNOWN)[number];

const isKnown = (code: unknown): code is KnownCode => (KNOWN as readonly unknown[]).includes(code);

/** The message key (from the root namespace) for an API error body. */
export function errorMessageKey(error: unknown): `Admin.errors.${KnownCode}` | "Common.error" {
  const code = (error as { code?: unknown } | undefined)?.code;
  return isKnown(code) ? `Admin.errors.${code}` : "Common.error";
}

/** The message key for a zod issue on a form field (the shared schemas use these codes). */
export function fieldMessageKey(message: string | undefined) {
  if (message === "invalid_phone" || message === "invalid_email" || message === "term_end_before_start") {
    return `Admin.errors.${message}` as const;
  }
  return "Admin.errors.required" as const;
}
