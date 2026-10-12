import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNav } from "@/components/site/site-nav";
import { getSiteInfo } from "@/lib/api/public";
import { getBrand } from "@/lib/brand";

// Public pages are cached and refreshed at most once a minute.
export const revalidate = 60;

/** Public website shell from the mockup: top bar, site nav, page, footer. */
export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [brand, info] = await Promise.all([getBrand(locale), getSiteInfo()]);

  return (
    <>
      <SiteHeader brand={brand} />
      <SiteNav />
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-[22px]">
        {children}
      </main>
      <SiteFooter name={brand.name} info={info} locale={locale} />
    </>
  );
}
