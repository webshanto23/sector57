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
  "location_name_taken",
  "location_code_taken",
  "location_has_children",
  "location_in_use",
  "location_not_found",
  "unit_not_found",
  "parent_inactive",
  "invalid_level",
  "level_in_use",
  "level_name_taken",
] as const;
type KnownCode = (typeof KNOWN)[number];

const isKnown = (code: unknown): code is KnownCode => (KNOWN as readonly unknown[]).includes(code);

/** The message key (from the root namespace) for an API error body. */
export function errorMessageKey(error: unknown): `Admin.errors.${KnownCode}` | "Common.error" {
  const code = (error as { code?: unknown } | undefined)?.code;
  return isKnown(code) ? `Admin.errors.${code}` : "Common.error";
}

const FIELD_CODES = [
  "invalid_phone",
  "invalid_email",
  "term_end_before_start",
  "invalid_size",
  "duplicate_name",
  "range_reversed",
  "too_many",
] as const;
type FieldCode = (typeof FIELD_CODES)[number];

/** The message key for a zod issue on a form field (the shared schemas use these codes). */
export function fieldMessageKey(message: string | undefined) {
  if (FIELD_CODES.includes(message as FieldCode)) return `Admin.errors.${message as FieldCode}` as const;
  return "Admin.errors.required" as const;
}
