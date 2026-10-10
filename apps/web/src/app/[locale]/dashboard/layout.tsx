import { pick, type Locale } from "@s57/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site/site-header";
import { getSociety } from "@/lib/api/public";

/**
 * Logged-in area. Step 4 shows a placeholder page; Step 5 replaces this with
 * the dashboard shell from the mockup (permission-filtered sidebar).
 */
export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/dashboard">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, society] = await Promise.all([getTranslations("Common"), getSociety()]);
  const name = society ? pick(society.nameBn, society.nameEn, locale) : t("societyName");

  return (
    <>
      <SiteHeader name={name} />
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-[22px]">
        {children}
      </main>
    </>
  );
}
