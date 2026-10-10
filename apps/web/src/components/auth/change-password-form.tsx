"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, newPassword } from "@s57/shared";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

// The API checks the shared schema; the form adds the "type it twice" check.
const formSchema = changePasswordSchema.and(z.object({ confirmPassword: newPassword })).refine(
  (value) => value.newPassword === value.confirmPassword,
  { path: ["confirmPassword"], message: "password_mismatch" },
);
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const MESSAGES = {
  password_too_short: "passwordTooShort",
  password_unchanged: "passwordUnchanged",
  password_mismatch: "passwordMismatch",
} as const;

const FIELDS = [
  { name: "currentPassword", label: "currentPassword", autoComplete: "current-password" },
  { name: "newPassword", label: "newPassword", autoComplete: "new-password" },
  { name: "confirmPassword", label: "confirmPassword", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({ resolver: zodResolver(formSchema) });

  async function onSubmit({ currentPassword, newPassword }: FormOutput) {
    setStatus(null);
    try {
      const { response, error } = await api.POST("/me/password", { body: { currentPassword, newPassword } });
      if (response.ok) {
        reset();
        setStatus({ ok: true, text: t("Account.passwordChanged") });
      } else if (response.status === 401) {
        router.replace("/login");
      } else {
        const code = (error as { code?: string } | undefined)?.code;
        setStatus({ ok: false, text: t(code === "wrong_password" ? "Auth.errors.wrongPassword" : "Common.error") });
      }
    } catch {
      setStatus({ ok: false, text: t("Auth.errors.network") });
    }
  }

  const message = (raw: string | undefined) =>
    t(`Auth.errors.${MESSAGES[raw as keyof typeof MESSAGES] ?? "passwordRequired"}`);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3.5">
      {FIELDS.map(({ name, label, autoComplete }) => (
        <Field key={name} label={t(`Account.${label}`)} htmlFor={name}>
          <input
            id={name}
            type="password"
            autoComplete={autoComplete}
            aria-invalid={errors[name] ? true : undefined}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
            className={inputClass}
            {...register(name)}
          />
          {errors[name] ? (
            <p id={`${name}-error`} className="text-[12.5px] text-bad">
              {message(errors[name]?.message)}
            </p>
          ) : null}
        </Field>
      ))}

      {status ? (
        <p
          role={status.ok ? "status" : "alert"}
          className={`flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-[13.5px] ${status.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}
        >
          {status.ok ? (
            <CircleCheck className="mt-0.5 size-[15px] flex-none" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 size-[15px] flex-none" aria-hidden />
          )}
          {status.text}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="justify-self-start">
        {isSubmitting ? t("Account.saving") : t("Account.savePassword")}
      </Button>
    </form>
  );
}
