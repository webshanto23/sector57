import { canAnywhere, type Locale } from "@s57/shared";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CommitteeManager } from "@/components/cms/committee/committee-manager";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCommitteeSeats } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/website/committee">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Cms.tabs" });
  return { title: t("committee") };
}

/** The managing committee, every term. The public page shows the term serving today. */
export default async function CommitteeAdminPage({ params }: PageProps<"/[locale]/dashboard/website/committee">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("committee");
  const [t, list] = await Promise.all([getTranslations("Cms.committee"), getCommitteeSeats()]);

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <Link href="/committee" target="_blank" className={buttonVariants({ variant: "outline" })}>
            <ExternalLink aria-hidden />
            {t("viewOnSite")}
          </Link>
        }
      />
      <CommitteeManager
        seats={list.items}
        can={{
          create: canAnywhere(me.access, "committee", "create"),
          edit: canAnywhere(me.access, "committee", "edit"),
          delete: canAnywhere(me.access, "committee", "delete"),
        }}
      />
    </>
  );
}
