"use client";

import { DOCUMENT_ACCEPT, FORM_HONEYPOT } from "@s57/shared";
import { FileText, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Field } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { documentProblem } from "./submit";

/**
 * A field that is invisible to people (off-screen, skipped by the keyboard and screen readers)
 * but that form-filling bots tend to fill in. The API saves nothing when it is not empty.
 */
export function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name={FORM_HONEYPOT} tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** Pick one photo or PDF (checked in the browser first: type and size), shown with its name and a remove button. */
export function DocumentField({
  id,
  label,
  file,
  error,
  onChange,
}: {
  id: string;
  label: string;
  file: File | null;
  error?: string | null;
  onChange: (file: File | null, problem: string | null) => void;
}) {
  const t = useTranslations("Forms");
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        ref={input}
        id={id}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (!picked) return;
          const problem = documentProblem(picked);
          onChange(problem ? null : picked, problem ? t(problem) : null);
        }}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13.5px]">
          <FileText className="size-4 flex-none text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null, null)} aria-label={t("removePerson")}>
            <X aria-hidden />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => input.current?.click()}>
          <Paperclip aria-hidden />
          {label}
        </Button>
      )}
      <p id={hintId} className="text-[12.5px] text-muted-foreground">
        {t("fileHint")}
      </p>
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : null}
    </Field>
  );
}
