import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewAssetForm } from "@/components/facilities/asset-forms";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAssetOptions } from "@/lib/api/facilities";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/assets/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Assets" });
  return { title: t("newTitle") };
}

/** A new asset, at a facility or on a place in the user's `facilities.create` area (`?facilityId=` preselects one). */
export default async function NewAssetPage({ params, searchParams }: PageProps<"/[locale]/dashboard/facilities/assets/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("facilities", "create");
  const [t, options] = await Promise.all([getTranslations("Assets"), getAssetOptions()]);
  const requested = (await searchParams)["facilityId"];
  const facilityId = typeof requested === "string" && options.facilities.some((facility) => facility.id === requested) ? requested : null;

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/facilities/assets" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewAssetForm options={options} facilityId={facilityId} />
    </>
  );
}
