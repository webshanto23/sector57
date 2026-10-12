import { canSocietyWide, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { TransferForm } from "@/components/ledger/transfer-form";
import { getFunds } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/ledger/transfers/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Ledger.form" });
  return { title: t("title") };
}

/** A bank deposit, a withdrawal, or money moved between funds (`ledger.create`). */
export default async function NewTransferPage({ params }: PageProps<"/[locale]/dashboard/ledger/transfers/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("ledger", "create");
  if (!canSocietyWide(me.access, "ledger", "create")) notFound();
  const [t, funds] = await Promise.all([getTranslations("Ledger.form"), getFunds()]);

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <TransferForm funds={funds.items} />
    </>
  );
}
