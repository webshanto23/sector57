"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type UserDetail, type UserFormOptions } from "@s57/shared";
import { KeyRound, UserRoundCheck, UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { AssignmentsEditor, completeAssignments, type DraftAssignment } from "./assignments-editor";
import { ConfirmButton } from "./confirm-button";
import { errorMessageKey } from "./errors";
import { FormStatus, type Status } from "./form-status";
import { PasswordPanel } from "./password-panel";
import { ProfileFields } from "./profile-fields";

const profileSchema = createUserSchema.pick({ name: true, nameEn: true, email: true, language: true });
type ProfileInput = z.input<typeof profileSchema>;
type ProfileOutput = z.output<typeof profileSchema>;

/** Sends a change, reports the outcome, and reloads the page's server data on success. */
function useSubmit() {
  const t = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  async function run(call: () => Promise<{ error?: unknown; response: Response }>, onOk?: () => void) {
    setStatus(null);
    try {
      const { response, error } = await call();
      if (response.ok) {
        setStatus({ ok: true, text: t("Admin.saved") });
        onOk?.();
        router.refresh();
      } else {
        setStatus({ ok: false, text: t(errorMessageKey(error)) });
      }
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
    }
  }
  return { status, run };
}

/** Name, English name, email and language. Phone is the login and can't change here. */
export function UserProfileForm({ user, editable }: { user: UserDetail; editable: boolean }) {
  const t = useTranslations("Admin");
  const { status, run } = useSubmit();
  const form = useForm<ProfileInput, unknown, ProfileOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name ?? "", nameEn: user.nameEn ?? "", email: user.email ?? "", language: user.language },
  });

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={form.handleSubmit((body) => run(() => api.PATCH("/users/{id}", { params: { path: { id: user.id } }, body })))}
    >
      <ProfileFields register={form.register} errors={form.formState.errors} idPrefix="user" readOnly={!editable} />
      <FormStatus status={status} />
      {editable ? (
        <Button type="submit" disabled={form.formState.isSubmitting} className="justify-self-start">
          {form.formState.isSubmitting ? t("saving") : t("users.saveProfile")}
        </Button>
      ) : null}
    </form>
  );
}

/** The user's roles, editable when the caller may manage this user. */
export function UserRolesForm({ user, options }: { user: UserDetail; options: UserFormOptions }) {
  const t = useTranslations("Admin");
  const { status, run } = useSubmit();
  const [rows, setRows] = useState<DraftAssignment[]>(() =>
    user.roles.map((role) => ({ roleId: role.roleId, scopeLocationId: role.scopeLocationId })),
  );
  const [saving, setSaving] = useState(false);

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        await run(() =>
          api.PUT("/users/{id}/roles", { params: { path: { id: user.id } }, body: { roles: completeAssignments(rows) } }),
        );
        setSaving(false);
      }}
    >
      <AssignmentsEditor rows={rows} onChange={setRows} options={options} idPrefix="user" />
      <FormStatus status={status} />
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? t("saving") : t("users.saveRoles")}
      </Button>
    </form>
  );
}

/** Disable or enable the account, and reset its password (shown once). */
export function UserAccountActions({ user }: { user: UserDetail }) {
  const t = useTranslations("Admin.users");
  const { status, run } = useSubmit();
  const [password, setPassword] = useState<string | null>(null);
  const disabled = user.status === "disabled";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start gap-2.5">
        {disabled ? (
          <ConfirmButton
            label={t("enable")}
            question={t("enable")}
            icon={UserRoundCheck}
            onConfirm={() => run(() => api.PATCH("/users/{id}", { params: { path: { id: user.id } }, body: { status: "active" } }))}
          />
        ) : (
          <ConfirmButton
            label={t("disable")}
            question={t("confirmDisable")}
            icon={UserRoundX}
            destructive
            onConfirm={() => run(() => api.PATCH("/users/{id}", { params: { path: { id: user.id } }, body: { status: "disabled" } }))}
          />
        )}
        <ConfirmButton
          label={t("resetPassword")}
          question={t("confirmReset")}
          icon={KeyRound}
          onConfirm={() =>
            run(
              async () => {
                const result = await api.POST("/users/{id}/reset-password", { params: { path: { id: user.id } } });
                if (result.data) setPassword(result.data.temporaryPassword);
                return result;
              },
            )
          }
        />
      </div>
      {password ? <PasswordPanel password={password} /> : <FormStatus status={status} />}
    </div>
  );
}
