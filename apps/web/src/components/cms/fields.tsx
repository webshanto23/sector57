"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import type { FieldError as HookFieldError } from "react-hook-form";
import { fieldMessageKey } from "@/components/admin/errors";
import { Field, inputClass } from "@/components/kit";

/** The validation message under a field, linked by `${id}-error`. */
export function FieldMessage({ id, error }: { id: string; error: HookFieldError | undefined }) {
  const t = useTranslations();
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="text-[12.5px] text-bad">
      {t(fieldMessageKey(error.message))}
    </p>
  );
}

const describedBy = (id: string, error: unknown, hint?: ReactNode) =>
  [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

/** Label, input and message. Pass `register(...)` props through `input`. */
export function TextField({
  id,
  label,
  error,
  hint,
  className,
  ...input
}: ComponentProps<"input"> & { id: string; label: ReactNode; error?: HookFieldError; hint?: ReactNode }) {
  return (
    <div className={className}>
      <Field label={label} htmlFor={id}>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={inputClass}
          {...input}
        />
        {hint ? (
          <p id={`${id}-hint`} className="text-[12.5px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
        <FieldMessage id={id} error={error} />
      </Field>
    </div>
  );
}

/** Label, textarea and message. */
export function TextAreaField({
  id,
  label,
  error,
  className,
  ...textarea
}: ComponentProps<"textarea"> & { id: string; label: ReactNode; error?: HookFieldError }) {
  return (
    <div className={className}>
      <Field label={label} htmlFor={id}>
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error)}
          className={cn(inputClass, "min-h-24 leading-relaxed")}
          {...textarea}
        />
        <FieldMessage id={id} error={error} />
      </Field>
    </div>
  );
}

/** A checkbox with its label on the right and an optional hint below. */
export function CheckField({
  id,
  label,
  hint,
  ...input
}: Omit<ComponentProps<"input">, "type"> & { id: string; label: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-[13.5px] font-semibold">
        <input id={id} type="checkbox" className="size-4 accent-primary" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="pl-6 text-[12.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A small heading inside a card, with an optional line under it. */
export function SectionTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[15px]">{title}</h2>
      {sub ? <p className="text-[13px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
