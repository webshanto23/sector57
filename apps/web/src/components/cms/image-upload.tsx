"use client";

import { IMAGE_ACCEPT, IMAGE_UPLOAD } from "@s57/shared";
import type { LucideIcon } from "lucide-react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";

/** The API error code a file would get, checked in the browser first; null when it may be sent. */
export function imageProblem(file: File): "unsupported_image" | "payload_too_large" | null {
  if (!(IMAGE_UPLOAD.types as readonly string[]).includes(file.type)) return "unsupported_image";
  if (file.size > IMAGE_UPLOAD.maxBytes) return "payload_too_large";
  return null;
}

/** A button that opens the file picker for photos (JPEG, PNG, WebP). The input is cleared after each pick. */
export function ImageUploadButton({
  label,
  icon: Icon,
  multiple = false,
  disabled = false,
  variant = "outline",
  onFiles,
}: {
  label: string;
  icon?: LucideIcon;
  multiple?: boolean;
  disabled?: boolean;
  variant?: "outline" | "default";
  onFiles: (files: File[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button type="button" variant={variant} disabled={disabled} onClick={() => input.current?.click()}>
        {Icon ? <Icon aria-hidden /> : null}
        {label}
      </Button>
    </>
  );
}
