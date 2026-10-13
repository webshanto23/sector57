import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SlaForm } from "@/components/helpdesk/sla-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSla } from "@/lib/api/helpdesk";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/helpdesk/hours">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Helpdesk" });
  return { title: t("hoursTitle") };
}

/** Hours to fix per category; changing them is a society setting (`settings.edit`), anyone on the helpdesk may look. */
export default async function HelpdeskHoursPage({ params }: PageProps<"/[locale]/dashboard/helpdesk/hours">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const [t, sla] = await Promise.all([getTranslations("Helpdesk"), getSla()]);

  return (
    <>
      <PageHeader
        title={t("hoursTitle")}
        sub={t("hoursHint")}
        actions={
          <Link href="/dashboard/helpdesk" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <SlaForm sla={sla} />
    </>
  );
}
