"use client";

import { pick, type Locale, type RoleAssignment, type ScopeOption, type UserFormOptions } from "@s57/shared";
import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";

/** A row being edited: `roleId` is empty until a role is picked. */
export type DraftAssignment = { roleId: string; scopeLocationId: string | null };

/** The rows that are complete, without duplicates, ready for the API. */
export function completeAssignments(rows: DraftAssignment[]): RoleAssignment[] {
  const seen = new Map<string, RoleAssignment>();
  for (const row of rows) {
    if (row.roleId) seen.set(`${row.roleId}:${row.scopeLocationId ?? "*"}`, row);
  }
  return [...seen.values()];
}

/** Areas in tree order (each parent followed by its children, by name), with their depth for indenting. */
function treeOrder(scopes: ScopeOption[]): ScopeOption[] {
  const ids = new Set(scopes.map((scope) => scope.id));
  const children = new Map<string | null, ScopeOption[]>();
  for (const scope of scopes) {
    const parent = scope.parentId && ids.has(scope.parentId) ? scope.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), scope]);
  }
  const ordered: ScopeOption[] = [];
  const visit = (parent: string | null) => {
    for (const scope of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, "bn"))) {
      ordered.push(scope);
      visit(scope.id);
    }
  };
  visit(null);
  return ordered;
}

/**
 * The roles a user holds, each optionally limited to an area. The system role is
 * offered only to callers who may give it; the API checks every other limit.
 */
export function AssignmentsEditor({
  rows,
  onChange,
  options,
  idPrefix,
}: {
  rows: DraftAssignment[];
  onChange: (rows: DraftAssignment[]) => void;
  options: UserFormOptions;
  idPrefix: string;
}) {
  const t = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const scopes = useMemo(() => treeOrder(options.scopes), [options.scopes]);
  const minDepth = Math.min(...scopes.map((scope) => scope.depth));

  const update = (index: number, change: Partial<DraftAssignment>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <div className="grid gap-2.5">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-[8px] border border-line p-2.5 min-[600px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] min-[600px]:items-end">
          <label className="grid gap-[5px] text-[13px] font-semibold" htmlFor={`${idPrefix}-role-${index}`}>
            {t("users.roles")}
            <select
              id={`${idPrefix}-role-${index}`}
              className={inputClass}
              value={row.roleId}
              onChange={(event) => update(index, { roleId: event.target.value })}
            >
              <option value="">{t("users.pickRole")}</option>
              {options.roles.map((role) => (
                <option key={role.id} value={role.id} disabled={role.isSystem && !role.grantable}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-[5px] text-[13px] font-semibold" htmlFor={`${idPrefix}-scope-${index}`}>
            {t("users.area")}
            <select
              id={`${idPrefix}-scope-${index}`}
              className={inputClass}
              value={row.scopeLocationId ?? ""}
              onChange={(event) => update(index, { scopeLocationId: event.target.value || null })}
            >
              <option value="">{t("wholeSociety")}</option>
              {scopes.map((scope) => (
                <option key={scope.id} value={scope.id}>
                  {`${"  ".repeat(scope.depth - minDepth)}${scope.name} (${pick(scope.levelBn, scope.levelEn, locale)})`}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("users.removeRole")}
            title={t("users.removeRole")}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { roleId: "", scopeLocationId: null }])}>
          <Plus aria-hidden />
          {t("users.addRole")}
        </Button>
        {scopes.length === 0 ? <span className="text-[12.5px] text-muted-foreground">{t("users.noScopes")}</span> : null}
      </div>
    </div>
  );
}
