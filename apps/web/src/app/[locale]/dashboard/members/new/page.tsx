import { canSocietyWide, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { NewMemberForm } from "@/components/members/member-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSociety } from "@/lib/api/public";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Members" });
  return { title: t("newTitle") };
}

/** The office adds a society member directly. Whole-society roles only. */
export default async function NewMemberPage({ params }: PageProps<"/[locale]/dashboard/members/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("members", "create");
  if (!canSocietyWide(me.access, "members", "create")) notFound();
  const [t, society] = await Promise.all([getTranslations("Members"), getSociety()]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/members" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("backToMembers")}
          </Link>
        }
      />
      <NewMemberForm nidRequired={society?.requireIdNumbers ?? false} />
    </>
  );
}
