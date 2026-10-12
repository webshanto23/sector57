import { type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeadsManager, VendorsManager } from "@/components/expenses/setup-managers";
import { PageHeader } from "@/components/kit";
import { getExpenseOptions } from "@/lib/api/expenses";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/expenses/setup">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Expenses.setup" });
  return { title: t("title") };
}

/** Expense heads and vendors, side by side on wide screens (`expenses.edit`). */
export default async function ExpenseSetupPage({ params }: PageProps<"/[locale]/dashboard/expenses/setup">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("expenses", "edit");
  const [t, options] = await Promise.all([getTranslations("Expenses.setup"), getExpenseOptions()]);

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <div className="grid gap-5 min-[1000px]:grid-cols-2 min-[1000px]:items-start">
        <HeadsManager heads={options.heads} />
        <VendorsManager vendors={options.vendors} />
      </div>
    </>
  );
}
