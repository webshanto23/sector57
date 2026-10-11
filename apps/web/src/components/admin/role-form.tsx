"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  canGrant,
  isLocationScoped,
  PERMISSION_ACTIONS,
  roleInputSchema,
  type Access,
  type PermissionAction,
  type PermissionModule,
  type RoleDetail,
} from "@s57/shared";
import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { errorMessageKey } from "./errors";
import { FormStatus, Note, type Status } from "./form-status";
import { MATRIX_GROUPS } from "./modules";

const detailsSchema = roleInputSchema.pick({ name: true, description: true });
type DetailsInput = z.input<typeof detailsSchema>;
type DetailsOutput = z.output<typeof detailsSchema>;

const key = (module: PermissionModule, action: PermissionAction) => `${module}:${action}`;
const COLUMNS = "min-[700px]:grid-cols-[minmax(0,1fr)_repeat(6,76px)]";

/**
 * Create or edit a role: name, description and the module × action matrix.
 * Cells the caller can't grant are disabled; a role holding such permissions, and
 * the system role, are shown read-only. The API enforces the same rules.
 */
export function RoleForm({ role, access, canEdit }: { role?: RoleDetail; access: Access; canEdit: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [checked, setChecked] = useState(() => new Set(role?.permissions.map((p) => key(p.module, p.action))));
  const [status, setStatus] = useState<Status>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DetailsInput, unknown, DetailsOutput>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: role?.name ?? "", description: role?.description ?? "" },
  });

  const beyond = role?.permissions.some((p) => !canGrant(access, p.module, p.action)) ?? false;
  const readOnly = !canEdit || role?.isSystem === true || beyond;
  const grantable = (module: PermissionModule, action: PermissionAction) => !readOnly && canGrant(access, module, action);

  function setMany(cells: [PermissionModule, PermissionAction][]) {
    const open = cells.filter(([module, action]) => grantable(module, action));
    if (open.length === 0) return;
    const allOn = open.every(([module, action]) => checked.has(key(module, action)));
    const next = new Set(checked);
    for (const [module, action] of open) {
      if (allOn) next.delete(key(module, action));
      else next.add(key(module, action));
    }
    setChecked(next);
  }

  async function onSubmit(details: DetailsOutput) {
    setStatus(null);
    const permissions = [...checked].map((cell) => {
      const [module, action] = cell.split(":") as [PermissionModule, PermissionAction];
      return { module, action };
    });
    const body = { ...details, permissions };
    try {
      const { data, error } = role
        ? await api.PUT("/roles/{id}", { params: { path: { id: role.id } }, body })
        : await api.POST("/roles", { body });
      if (data) {
        if (role) {
          setStatus({ ok: true, text: t("Admin.saved") });
          router.refresh();
        } else {
          router.push(`/dashboard/roles/${data.id}`);
        }
      } else {
        setStatus({ ok: false, text: t(errorMessageKey(error)) });
      }
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      {role?.isSystem ? <Note>{t("Admin.roles.systemNote")}</Note> : null}
      {!role?.isSystem && beyond ? <Note tone="warn">{t("Admin.roles.beyondNote")}</Note> : null}
      {!role?.isSystem && !beyond && !canEdit ? <Note>{t("Admin.roles.readOnlyNote")}</Note> : null}

      <div className="grid gap-3.5 min-[701px]:grid-cols-2">
        <Field label={t("Admin.roles.name")} htmlFor="role-name">
          <input
            id="role-name"
            className={inputClass}
            readOnly={readOnly}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "role-name-error" : undefined}
            {...register("name")}
          />
          {errors.name ? (
            <p id="role-name-error" className="text-[12.5px] text-bad">
              {t("Admin.errors.required")}
            </p>
          ) : null}
        </Field>
        <Field label={t("Admin.roles.description")} htmlFor="role-description">
          <input id="role-description" className={inputClass} readOnly={readOnly} {...register("description")} />
        </Field>
      </div>

      <fieldset className="grid gap-1 rounded-[12px] border border-line bg-surface p-3.5 min-[600px]:p-4">
        <legend className="px-1 text-[15px] font-semibold">{t("Admin.roles.permissions")}</legend>
        {!readOnly ? <p className="mb-2 text-[13px] text-muted-foreground">{t("Admin.roles.grantHint")}</p> : null}

        <div className={`hidden items-end gap-2 border-b border-line pb-2 text-[12.5px] font-semibold text-muted-foreground min-[700px]:grid ${COLUMNS}`}>
          <span>{t("Admin.roles.module")}</span>
          {PERMISSION_ACTIONS.map((action) =>
            readOnly ? (
              <span key={action} className="text-center">
                {t(`Admin.actions.${action}`)}
              </span>
            ) : (
              <button
                key={action}
                type="button"
                className="rounded-[6px] px-1 py-0.5 text-center hover:bg-surface-2 hover:text-fg"
                aria-label={t("Admin.roles.toggleColumn", { action: t(`Admin.actions.${action}`) })}
                onClick={() => setMany(MATRIX_GROUPS.flatMap((g) => g.modules.map((m) => [m, action] as [PermissionModule, PermissionAction])))}
              >
                {t(`Admin.actions.${action}`)}
              </button>
            ),
          )}
        </div>

        {MATRIX_GROUPS.map((group) => (
          <div key={group.key} className="grid">
            <h3 className="pt-3 pb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t(`Dashboard.groups.${group.key}`)}
            </h3>
            {group.modules.map((module) => {
              const label = t(`Admin.modules.${module}`);
              return (
                <div key={module} className={`grid gap-2 border-b border-line py-2.5 last:border-b-0 min-[700px]:items-center ${COLUMNS}`}>
                  <div className="flex items-center gap-1.5 font-medium">
                    {readOnly ? (
                      <span>{label}</span>
                    ) : (
                      <button
                        type="button"
                        className="rounded-[6px] text-left hover:text-primary"
                        aria-label={t("Admin.roles.toggleRow", { module: label })}
                        onClick={() => setMany(PERMISSION_ACTIONS.map((action) => [module, action]))}
                      >
                        {label}
                      </button>
                    )}
                    {isLocationScoped(module) ? (
                      <MapPin className="size-[13px] text-muted-foreground" aria-label={t("Admin.areaBound")} role="img">
                        <title>{t("Admin.areaBound")}</title>
                      </MapPin>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 min-[700px]:contents">
                    {PERMISSION_ACTIONS.map((action) => {
                      const cell = key(module, action);
                      const enabled = grantable(module, action);
                      return (
                        <label
                          key={action}
                          className={`inline-flex items-center gap-1.5 text-[13.5px] min-[700px]:justify-center ${enabled ? "cursor-pointer" : "opacity-60"}`}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={checked.has(cell)}
                            disabled={!enabled}
                            aria-label={`${label}: ${t(`Admin.actions.${action}`)}`}
                            onChange={() => setMany([[module, action]])}
                          />
                          <span aria-hidden className="min-[700px]:hidden">
                            {t(`Admin.actions.${action}`)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </fieldset>

      <FormStatus status={status} />

      {!readOnly ? (
        <Button type="submit" disabled={isSubmitting} className="justify-self-start">
          {isSubmitting ? t("Admin.saving") : t(role ? "Admin.roles.save" : "Admin.roles.create")}
        </Button>
      ) : null}
    </form>
  );
}
