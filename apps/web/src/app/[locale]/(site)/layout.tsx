import { pick, type Locale } from "@s57/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNav } from "@/components/site/site-nav";
import { getSiteInfo, getSociety } from "@/lib/api/public";

// Public pages are cached and refreshed at most once a minute.
export const revalidate = 60;

/** Public website shell from the mockup: top bar, site nav, page, footer. */
export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, society, info] = await Promise.all([getTranslations("Common"), getSociety(), getSiteInfo()]);
  const name = society ? pick(society.nameBn, society.nameEn, locale) : t("societyName");

  return (
    <>
      <SiteHeader name={name} />
      <SiteNav />
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-[22px]">
        {children}
      </main>
      <SiteFooter name={name} info={info} locale={locale} />
    </>
  );
}
