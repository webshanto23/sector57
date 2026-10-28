import { canSocietyWide, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { NewPersonForm } from "@/components/members/person-editor";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Members" });
  return { title: t("newTitle") };
}

/** Someone not linked to a unit yet. Whole-society roles only; others add people from a unit's page. */
export default async function NewMemberPage({ params }: PageProps<"/[locale]/dashboard/members/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("members", "create");
  if (!canSocietyWide(me.access, "members", "create")) notFound();
  const t = await getTranslations("Members");

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/owners" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewPersonForm />
    </>
  );
}
