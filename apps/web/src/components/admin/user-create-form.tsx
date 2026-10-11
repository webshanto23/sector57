"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type UserFormOptions } from "@s57/shared";
import { UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Card } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { AssignmentsEditor, completeAssignments, type DraftAssignment } from "./assignments-editor";
import { errorMessageKey } from "./errors";
import { FormStatus, type Status } from "./form-status";
import { PasswordPanel } from "./password-panel";
import { ProfileFields } from "./profile-fields";

const formSchema = createUserSchema.omit({ roles: true });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** New user: profile, roles, then the temporary password shown once. */
export function UserCreateForm({ options }: { options: UserFormOptions }) {
  const t = useTranslations();
  const [rows, setRows] = useState<DraftAssignment[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [created, setCreated] = useState<{ id: string; temporaryPassword: string } | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", nameEn: "", phone: "", email: "", language: "bn" },
  });

  async function onSubmit(values: FormOutput) {
    setStatus(null);
    try {
      const { data, error } = await api.POST("/users", { body: { ...values, roles: completeAssignments(rows) } });
      if (data) setCreated(data);
      else setStatus({ ok: false, text: t(errorMessageKey(error)) });
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
    }
  }

  if (created) {
    return (
      <Card className="grid max-w-[640px] gap-3.5">
        <PasswordPanel password={created.temporaryPassword} />
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/dashboard/users/${created.id}`} className={buttonVariants()}>
            {t("Admin.users.openUser")}
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset();
              setRows([]);
              setCreated(null);
            }}
          >
            <UserRoundPlus aria-hidden />
            {t("Admin.users.addAnother")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid max-w-[860px] gap-3.5">
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("Admin.users.profile")}</h2>
        <ProfileFields register={form.register} errors={form.formState.errors} idPrefix="new-user" withPhone />
      </Card>
      <Card className="grid gap-3.5">
        <div>
          <h2 className="text-[15px]">{t("Admin.users.roles")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("Admin.users.rolesSub")}</p>
        </div>
        <AssignmentsEditor rows={rows} onChange={setRows} options={options} idPrefix="new-user" />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={form.formState.isSubmitting} className="justify-self-start">
        {form.formState.isSubmitting ? t("Admin.saving") : t("Admin.users.create")}
      </Button>
    </form>
  );
}
