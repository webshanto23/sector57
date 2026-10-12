import { canSocietyWide, transferListQuery, type Locale } from "@s57/shared";
import { ArrowRightLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { PageHeader } from "@/components/kit";
import { TransfersTable } from "@/components/ledger/transfers-table";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getTransfers } from "@/lib/api/reports";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/ledger/transfers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Ledger.transfers" });
  return { title: t("title") };
}

/** Money moved between funds, deposited at the bank or withdrawn, newest first. */
export default async function TransfersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/ledger/transfers">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("ledger");
  const search = await searchParams;
  const parsed = transferListQuery.safeParse({ page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, tLedger, list] = await Promise.all([getTranslations("Ledger.transfers"), getTranslations("Ledger"), getTransfers(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          canSocietyWide(me.access, "ledger", "create") ? (
            <Link href="/dashboard/ledger/transfers/new" className={buttonVariants()}>
              <ArrowRightLeft aria-hidden />
              {tLedger("newTransfer")}
            </Link>
          ) : null
        }
      />
      <TransfersTable rows={list.items} locale={locale} empty={t("empty")} />
      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/ledger/transfers", query: target > 1 ? { page: String(target) } : {} })}
      />
    </>
  );
}
