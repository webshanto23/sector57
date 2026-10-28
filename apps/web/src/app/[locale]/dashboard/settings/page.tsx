import { canAnywhere, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SettingsForm } from "@/components/finance/settings-form";
import { PageHeader } from "@/components/kit";
import { MembershipSettingsCard } from "@/components/members/membership-settings";
import { redirect } from "@/i18n/navigation";
import { getSettings } from "@/lib/api/finance";
import { getMembershipSettings } from "@/lib/api/members";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/settings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.settings") };
}

/** The president's switches, fiscal year, receipt header and membership IDs. Without `settings.view` the section opens on the next tab. */
export default async function SettingsPage({ params }: PageProps<"/[locale]/dashboard/settings">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  // The layout has already answered 404 when no tab is allowed.
  const me = (await getMe())!;
  if (!canAnywhere(me.access, "settings")) {
    redirect({ href: canAnywhere(me.access, "ledger") ? "/dashboard/settings/funds" : "/dashboard/settings/charge-types", locale });
  }

  const [t, tDash, settings, membership] = await Promise.all([
    getTranslations("Finance.settings"),
    getTranslations("Dashboard"),
    getSettings(),
    getMembershipSettings(),
  ]);
  const canEdit = canAnywhere(me.access, "settings", "edit");

  return (
    <>
      <PageHeader title={tDash("nav.settings")} sub={t("sub")} />
      <div className="grid gap-3.5">
        <SettingsForm settings={settings} canEdit={canEdit} />
        <MembershipSettingsCard settings={membership} canEdit={canEdit} />
      </div>
    </>
  );
}
