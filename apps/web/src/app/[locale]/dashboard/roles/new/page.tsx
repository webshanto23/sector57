import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RoleForm } from "@/components/admin/role-form";
import { PageHeader } from "@/components/kit";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/roles/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.roles" });
  return { title: t("new") };
}

export default async function NewRolePage({ params }: PageProps<"/[locale]/dashboard/roles/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("roles", "create");
  const t = await getTranslations("Admin.roles");

  return (
    <>
      <PageHeader title={t("new")} sub={t("newSub")} />
      <RoleForm access={me.access} canEdit />
    </>
  );
}
