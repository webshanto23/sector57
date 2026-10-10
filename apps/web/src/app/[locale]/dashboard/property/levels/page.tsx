import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PageHeader } from "@/components/kit";
import { LevelsEditor } from "@/components/property/levels-editor";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLevels } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/property/levels">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Property" });
  return { title: t("levels") };
}

/** The levels of the map (sector, block, road ...), editable with the society settings permission. */
export default async function LevelsPage({ params }: PageProps<"/[locale]/dashboard/property/levels">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("settings", "edit");
  const [t, tNav, levels] = await Promise.all([getTranslations("Property"), getTranslations("Dashboard.nav"), getLevels()]);

  return (
    <>
      <PageHeader
        title={t("levels")}
        sub={t("levelsPage.sub")}
        actions={
          <Link href="/dashboard/property" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tNav("property")}
          </Link>
        }
      />
      <div className="grid max-w-[900px] gap-3.5">
        <Note>{t("levelsPage.rule")}</Note>
        <LevelsEditor levels={levels} />
      </div>
    </>
  );
}
