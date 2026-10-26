import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SiteHeader } from "@/components/site/site-header";
import { redirect } from "@/i18n/navigation";
import { getMe } from "@/lib/api/session";
import { getBrand } from "@/lib/brand";
import { SESSION_ENDED_PARAM } from "@/lib/session-proxy";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Logged-in area: the mockup's `.dash` frame (sidebar + page, 1440 px wide).
 * The sidebar only shows pages the user's permissions allow; the API still checks every call.
 */
export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/dashboard">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [brand, me] = await Promise.all([getBrand(locale), getMe()]);
  // The proxy normally redirects first; this covers a session the API refuses
  // although its token hasn't expired (revoked, or signed with another secret).
  if (!me) return redirect({ href: { pathname: "/login", query: { next: "/dashboard", [SESSION_ENDED_PARAM]: "1" } }, locale });

  return (
    <>
      <SiteHeader brand={brand} wide actions={<UserMenu me={me} locale={locale} />} />
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 content-start min-[861px]:grid-cols-[68px_minmax(0,1fr)] min-[1181px]:grid-cols-[248px_minmax(0,1fr)]">
        <DashboardSidebar visible={visibleNavKeys(me.access)} />
        <main id="main" className="min-w-0 px-4 pt-5 pb-10">
          {children}
        </main>
      </div>
    </>
  );
}
