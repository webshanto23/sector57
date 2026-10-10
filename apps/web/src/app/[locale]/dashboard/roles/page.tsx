import { canAnywhere, localDigits, type Locale, type RoleSummary } from "@s57/shared";
import { Plus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Chip, DataTable, PageHeader, type Column } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getRoles } from "@/lib/api/admin";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/roles">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.roles") };
}

/** Roles and permissions: every role with its users and permission count. */
export default async function RolesPage({ params }: PageProps<"/[locale]/dashboard/roles">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("roles");
  const [t, tDash, roles] = await Promise.all([getTranslations("Admin.roles"), getTranslations("Dashboard"), getRoles()]);

  const columns: Column<RoleSummary>[] = [
    {
      key: "name",
      header: t("name"),
      cell: (role) => (
        <Link href={`/dashboard/roles/${role.id}`} className="inline-flex items-center gap-2 font-semibold text-fg">
          {role.isSystem ? <ShieldCheck className="size-[15px] text-primary" aria-hidden /> : null}
          {role.name}
          {role.isSystem ? <Chip tone="acc" plain>{t("system")}</Chip> : null}
        </Link>
      ),
    },
    {
      key: "description",
      header: t("description"),
      cell: (role) => <span className="whitespace-normal text-muted-foreground">{role.description ?? "—"}</span>,
    },
    {
      key: "permissions",
      header: t("permissions"),
      cell: (role) =>
        role.isSystem ? t("fullAccess") : t("permissionCount", { count: localDigits(role.permissionCount, locale) }),
    },
    { key: "users", header: t("users"), numeric: true, cell: (role) => localDigits(role.userCount, locale) },
  ];

  return (
    <>
      <PageHeader
        title={tDash("nav.roles")}
        sub={t("sub")}
        actions={
          canAnywhere(me.access, "roles", "create") ? (
            <Link href="/dashboard/roles/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <DataTable columns={columns} rows={roles.items} rowKey={(role) => role.id} caption={tDash("nav.roles")} empty={t("empty")} />
    </>
  );
}
