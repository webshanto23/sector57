import { canAnywhere, type Locale } from "@s57/shared";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { WebsiteTabs, type WebsiteTab } from "@/components/cms/website-tabs";
import { getMe } from "@/lib/api/session";

const TAB_MODULES = { pages: "site", committee: "committee", gallery: "gallery" } as const;

/** Website content: page editors, committee and gallery, each shown only with its module's view permission. */
export default async function WebsiteLayout({ params, children }: LayoutProps<"/[locale]/dashboard/website">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const me = await getMe();
  const tabs = (Object.keys(TAB_MODULES) as WebsiteTab[]).filter((tab) => me && canAnywhere(me.access, TAB_MODULES[tab]));
  if (tabs.length === 0) notFound();

  return (
    <>
      <WebsiteTabs tabs={tabs} />
      {children}
    </>
  );
}
