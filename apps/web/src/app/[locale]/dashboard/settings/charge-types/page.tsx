import { canSocietyWide, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChargeTypesManager } from "@/components/finance/charge-types-manager";
import { PageHeader } from "@/components/kit";
import { getChargeTypes } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/settings/charge-types">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Finance.tabs" });
  return { title: t("chargeTypes") };
}

/** What bills can charge for. Changing them needs a society-wide billing role. */
export default async function ChargeTypesPage({ params }: PageProps<"/[locale]/dashboard/settings/charge-types">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("billing", "view");
  const [t, list] = await Promise.all([getTranslations("Finance"), getChargeTypes()]);

  return (
    <>
      <PageHeader title={t("tabs.chargeTypes")} sub={t("chargeTypes.sub")} />
      <ChargeTypesManager
        list={list}
        can={{ create: canSocietyWide(me.access, "billing", "create"), edit: canSocietyWide(me.access, "billing", "edit") }}
      />
    </>
  );
}
