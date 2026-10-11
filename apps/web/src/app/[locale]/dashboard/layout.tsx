import { pick, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SiteHeader } from "@/components/site/site-header";
import { redirect } from "@/i18n/navigation";
import { getSociety } from "@/lib/api/public";
import { getMe } from "@/lib/api/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Logged-in area: the mockup's `.dash` frame (sidebar + page, 1440 px wide).
 * The sidebar only shows pages the user's permissions allow; the API still checks every call.
 */
export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/dashboard">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, society, me] = await Promise.all([getTranslations("Common"), getSociety(), getMe()]);
  // The proxy normally redirects first; this covers a session revoked since then.
  if (!me) return redirect({ href: { pathname: "/login", query: { next: "/dashboard" } }, locale });
  const name = society ? pick(society.nameBn, society.nameEn, locale) : t("societyName");

  return (
    <>
      <SiteHeader name={name} wide actions={<UserMenu me={me} locale={locale} />} />
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 min-[861px]:grid-cols-[68px_minmax(0,1fr)] min-[1181px]:grid-cols-[248px_minmax(0,1fr)]">
        <DashboardSidebar visible={visibleNavKeys(me.access)} />
        <main id="main" className="min-w-0 px-4 pt-5 pb-10">
          {children}
        </main>
      </div>
    </>
  );
}
