import { canSocietyWide, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/kit";
import { NewStaffForm } from "@/components/staff/new-staff-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { todayInDhaka } from "@/lib/dhaka-time";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Staff" });
  return { title: t("newTitle") };
}

/** A new staff member, posted somewhere in the user's `staff.create` area (the API checks the place). */
export default async function NewStaffPage({ params }: PageProps<"/[locale]/dashboard/hrm/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("staff", "create");
  const t = await getTranslations("Staff");

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href="/dashboard/hrm" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewStaffForm today={todayInDhaka()} withPay={canSocietyWide(me.access, "staff", "edit")} />
    </>
  );
}
