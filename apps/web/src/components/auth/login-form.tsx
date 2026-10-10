"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDate, loginErrorDetails, loginSchema, type Locale, type LoginInput } from "@s57/shared";
import { Eye, EyeOff, LogIn, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

type FormValues = z.input<typeof loginSchema>;

/** zod issue messages from the shared schemas, mapped to Auth.errors keys. */
const FIELD_ERRORS = {
  invalid_phone: "invalidPhone",
  password_too_short: "passwordTooShort",
} as const;

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, LoginInput>({ resolver: zodResolver(loginSchema) });

  const fieldError = (message: string | undefined, fallback: "invalidPhone" | "passwordRequired") =>
    t(`errors.${FIELD_ERRORS[message as keyof typeof FIELD_ERRORS] ?? fallback}`);

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      const { data, error, response } = await api.POST("/auth/login", { body: values });
      if (data) {
        router.replace(next);
        router.refresh();
        return;
      }
      const details = loginErrorDetails.safeParse((error as { details?: unknown } | undefined)?.details);
      if (response.status === 423 && details.success && "lockedUntil" in details.data) {
        setFormError(t("errors.locked", { time: formatDate(details.data.lockedUntil, locale, "time") }));
      } else if (response.status === 401 && details.success && "attemptsLeft" in details.data) {
        const left = details.data.attemptsLeft;
        setFormError(left === 1 ? t("errors.lastAttempt") : t("errors.invalidCredentials", { count: left }));
      } else if (response.status === 429) {
        setFormError(t("errors.tooMany"));
      } else {
        setFormError(t("errors.network"));
      }
    } catch {
      setFormError(t("errors.network"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3.5">
      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-[8px] bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
          <TriangleAlert className="mt-0.5 size-[15px] flex-none" aria-hidden />
          {formError}
        </p>
      ) : null}

      <Field label={t("phone")} htmlFor="phone">
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          placeholder={t("phonePlaceholder")}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          className={inputClass}
          {...register("phone")}
        />
        {errors.phone ? (
          <p id="phone-error" className="text-[12.5px] text-bad">
            {fieldError(errors.phone.message, "invalidPhone")}
          </p>
        ) : null}
      </Field>

      <Field label={t("password")} htmlFor="password">
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={`${inputClass} pr-10`}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[8px] text-muted-foreground hover:text-fg focus-visible:outline-2 focus-visible:outline-primary"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {errors.password ? (
          <p id="password-error" className="text-[12.5px] text-bad">
            {fieldError(errors.password.message, "passwordRequired")}
          </p>
        ) : null}
      </Field>

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
        <LogIn aria-hidden />
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
