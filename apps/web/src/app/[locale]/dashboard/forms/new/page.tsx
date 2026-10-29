import { canAnywhere, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewApplication } from "@/components/forms-admin/new-application";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSociety } from "@/lib/api/public";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/forms/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "FormsAdmin" });
  return { title: t("newTitle") };
}

/** The office types in a membership or renter application received on paper or by phone. */
export default async function NewApplicationPage({ params }: PageProps<"/[locale]/dashboard/forms/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  // Applicants may hold `forms.create` alone; typing one in is for the office, who also sees the queue.
  const me = await requirePermission("forms", "create");
  if (!canAnywhere(me.access, "forms", "view")) notFound();
  const [t, society] = await Promise.all([getTranslations("FormsAdmin"), getSociety()]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/forms" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewApplication renterNidRequired={society?.requireIdNumbers ?? false} />
    </>
  );
}
