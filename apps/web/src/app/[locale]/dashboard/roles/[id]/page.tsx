import { canAnywhere, localDigits, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeleteRoleButton } from "@/components/admin/delete-role-button";
import { RoleForm } from "@/components/admin/role-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getRole } from "@/lib/api/admin";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/roles/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("roles");
  const role = await getRole(id);
  return role ? { title: role.name } : {};
}

/** One role: its matrix (editable when allowed) and, for a role nobody holds, delete. */
export default async function RolePage({ params }: PageProps<"/[locale]/dashboard/roles/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("roles");
  const [t, tDash, role] = await Promise.all([getTranslations("Admin.roles"), getTranslations("Dashboard"), getRole(id)]);
  if (!role) notFound();

  return (
    <>
      <PageHeader
        title={role.name}
        sub={`${t("users")}: ${localDigits(role.userCount, locale)}`}
        actions={
          <Link href="/dashboard/roles" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tDash("nav.roles")}
          </Link>
        }
      />
      <div className="grid gap-5">
        <RoleForm key={role.id} role={role} access={me.access} canEdit={canAnywhere(me.access, "roles", "edit")} />
        {!role.isSystem && canAnywhere(me.access, "roles", "delete") ? (
          <DeleteRoleButton id={role.id} inUse={role.userCount > 0} />
        ) : null}
      </div>
    </>
  );
}
