import { canAnywhere, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FundsManager } from "@/components/finance/funds-manager";
import { PageHeader } from "@/components/kit";
import { getFunds } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/settings/funds">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Finance.tabs" });
  return { title: t("funds") };
}

/** Funds, their balances in cash and at the bank, and opening balances. */
export default async function FundsPage({ params }: PageProps<"/[locale]/dashboard/settings/funds">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("ledger", "view");
  const [t, list] = await Promise.all([getTranslations("Finance"), getFunds()]);

  return (
    <>
      <PageHeader title={t("tabs.funds")} sub={t("funds.sub")} />
      <FundsManager
        list={list}
        can={{
          create: canAnywhere(me.access, "ledger", "create"),
          edit: canAnywhere(me.access, "ledger", "edit"),
          settings: canAnywhere(me.access, "settings", "edit"),
        }}
      />
    </>
  );
}
