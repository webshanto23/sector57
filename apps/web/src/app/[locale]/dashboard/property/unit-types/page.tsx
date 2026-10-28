import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PageHeader } from "@/components/kit";
import { UnitTypesEditor } from "@/components/property/unit-types-editor";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUnitTypes } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/property/unit-types">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Property" });
  return { title: t("unitTypes") };
}

/** The society's unit types (residential, shop ...), editable with the society settings permission, like the levels. */
export default async function UnitTypesPage({ params }: PageProps<"/[locale]/dashboard/property/unit-types">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("settings", "edit");
  const [t, tNav, types] = await Promise.all([getTranslations("Property"), getTranslations("Dashboard.nav"), getUnitTypes()]);

  return (
    <>
      <PageHeader
        title={t("unitTypes")}
        sub={t("unitTypesPage.sub")}
        actions={
          <Link href="/dashboard/property" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tNav("property")}
          </Link>
        }
      />
      <div className="grid max-w-[900px] gap-3.5">
        <Note>{t("unitTypesPage.rule")}</Note>
        <UnitTypesEditor types={types} />
      </div>
    </>
  );
}
