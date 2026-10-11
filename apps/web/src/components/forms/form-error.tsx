"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** API error codes the public forms explain (`Forms.errors.*`); anything else is the generic error. */
const KNOWN = [
  "already_submitted",
  "too_many_submissions",
  "too_many_requests",
  "invalid_place",
  "unsupported_document",
  "file_required",
  "payload_too_large",
  "validation_failed",
] as const;
type Known = (typeof KNOWN)[number];

/** The alert above a public form's submit button, and a setter that turns an API error code into text. */
export function useFormError() {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);
  const showApiError = (code: string | null) => {
    if (code === "network") return setFormError(t("Admin.errors.network"));
    setFormError((KNOWN as readonly (string | null)[]).includes(code) ? t(`Forms.errors.${code as Known}`) : t("Common.error"));
  };
  return { formError, setFormError, showApiError };
}

export function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[8px] bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
      <TriangleAlert className="mt-0.5 size-[15px] flex-none" aria-hidden />
      {text}
    </p>
  );
}
