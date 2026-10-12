import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { LedgerTabs } from "@/components/ledger/ledger-tabs";
import { requirePermission } from "@/lib/api/session";

/** The fund ledger (`ledger.view`): the statement and transfers. */
export default async function LedgerLayout({ params, children }: LayoutProps<"/[locale]/dashboard/ledger">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("ledger");

  return (
    <>
      <LedgerTabs />
      {children}
    </>
  );
}
