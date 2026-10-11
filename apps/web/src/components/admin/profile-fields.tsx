"use client";

import { LOCALES } from "@s57/shared";
import { useTranslations } from "next-intl";
import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Field, inputClass } from "@/components/kit";
import { fieldMessageKey } from "./errors";

const FIELDS = [
  { name: "name", label: "Admin.users.name", autoComplete: "name", type: "text" },
  { name: "nameEn", label: "Admin.users.nameEn", autoComplete: "off", type: "text" },
  { name: "phone", label: "Admin.users.phone", autoComplete: "tel", type: "tel" },
  { name: "email", label: "Admin.users.email", autoComplete: "email", type: "email" },
] as const;

type ProfileValues = { name: string; nameEn?: string | null; phone?: string; email?: string | null; language?: string };

/** Name, English name, (phone), email and language: shared by the create and profile forms. */
export function ProfileFields<T extends FieldValues>({
  register,
  errors: formErrors,
  idPrefix,
  withPhone = false,
  readOnly = false,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  idPrefix: string;
  withPhone?: boolean;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  // Each form has its own schema; these are the profile fields every one of them has.
  const errors = formErrors as FieldErrors<ProfileValues>;
  const field = (name: keyof ProfileValues) => register(name as Path<T>);
  const fields = FIELDS.filter((f) => withPhone || f.name !== "phone");

  return (
    <div className="grid gap-3.5 min-[701px]:grid-cols-2">
      {fields.map(({ name, label, autoComplete, type }) => {
        const id = `${idPrefix}-${name}`;
        const error = errors[name];
        return (
          <Field key={name} label={t(label)} htmlFor={id}>
            <input
              id={id}
              type={type}
              autoComplete={autoComplete}
              inputMode={type === "tel" ? "tel" : undefined}
              readOnly={readOnly}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={inputClass}
              {...field(name)}
            />
            {error ? (
              <p id={`${id}-error`} className="text-[12.5px] text-bad">
                {t(fieldMessageKey(error.message))}
              </p>
            ) : null}
          </Field>
        );
      })}
      <Field label={t("Admin.users.language")} htmlFor={`${idPrefix}-language`}>
        <select id={`${idPrefix}-language`} className={inputClass} disabled={readOnly} {...field("language")}>
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {locale === "bn" ? "বাংলা" : "English"}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
