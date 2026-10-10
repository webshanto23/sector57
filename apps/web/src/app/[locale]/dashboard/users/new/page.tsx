import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserCreateForm } from "@/components/admin/user-create-form";
import { PageHeader } from "@/components/kit";
import { getUserFormOptions } from "@/lib/api/admin";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/users/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.users" });
  return { title: t("new") };
}

export default async function NewUserPage({ params }: PageProps<"/[locale]/dashboard/users/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("users", "create");
  const [t, options] = await Promise.all([getTranslations("Admin.users"), getUserFormOptions()]);

  return (
    <>
      <PageHeader title={t("new")} sub={t("newSub")} />
      <UserCreateForm options={options} />
    </>
  );
}
