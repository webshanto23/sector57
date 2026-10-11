import { canAnywhere, type Locale } from "@s57/shared";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SettingsTabs, type SettingsTab } from "@/components/finance/settings-tabs";
import { getMe } from "@/lib/api/session";

const TAB_MODULES = { society: "settings", funds: "ledger", chargeTypes: "billing" } as const;

/** Society settings, funds and charge types, each shown only with its module's view permission. */
export default async function SettingsLayout({ params, children }: LayoutProps<"/[locale]/dashboard/settings">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const me = await getMe();
  const tabs = (Object.keys(TAB_MODULES) as SettingsTab[]).filter((tab) => me && canAnywhere(me.access, TAB_MODULES[tab]));
  if (tabs.length === 0) notFound();

  return (
    <>
      <SettingsTabs tabs={tabs} />
      {children}
    </>
  );
}
