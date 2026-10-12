import { type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getExpenseOptions } from "@/lib/api/expenses";
import { requirePermission } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/expenses/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Expenses.form" });
  return { title: t("title") };
}

/** A new expense request; someone else approves it. */
export default async function NewExpensePage({ params }: PageProps<"/[locale]/dashboard/expenses/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("expenses", "create");
  const [t, options] = await Promise.all([getTranslations("Expenses"), getExpenseOptions()]);

  return (
    <>
      <PageHeader
        title={t("form.title")}
        sub={t("form.sub")}
        actions={
          <Link href="/dashboard/expenses" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("detail.back")}
          </Link>
        }
      />
      <ExpenseForm options={options} today={todayInDhaka()} />
    </>
  );
}
