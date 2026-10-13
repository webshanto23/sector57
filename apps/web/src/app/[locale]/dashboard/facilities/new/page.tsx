import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewFacilityForm } from "@/components/facilities/facility-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFacilityFunds } from "@/lib/api/facilities";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Facilities" });
  return { title: t("newTitle") };
}

/** A new facility somewhere in the user's `facilities.create` area (the API checks the place). */
export default async function NewFacilityPage({ params }: PageProps<"/[locale]/dashboard/facilities/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("facilities", "create");
  const [t, funds] = await Promise.all([getTranslations("Facilities"), getFacilityFunds()]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/facilities" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewFacilityForm funds={funds} />
    </>
  );
}
