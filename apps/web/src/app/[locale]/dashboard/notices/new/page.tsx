import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NoticeForm } from "@/components/cms/notice-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/notices/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Cms.notices" });
  return { title: t("new") };
}

export default async function NewNoticePage({ params }: PageProps<"/[locale]/dashboard/notices/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("notices", "create");
  const t = await getTranslations("Cms.notices");

  return (
    <>
      <PageHeader
        title={t("new")}
        sub={t("newSub")}
        actions={
          <Link href="/dashboard/notices" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("backToList")}
          </Link>
        }
      />
      <NoticeForm canSave />
    </>
  );
}
