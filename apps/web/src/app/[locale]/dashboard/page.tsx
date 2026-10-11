import type { Locale } from "@s57/shared";
import { Info, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { Card, PageHeader } from "@/components/kit";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.overview") };
}

/** Overview: open to every logged-in user. Its figures come with billing (milestone 2). */
export default async function OverviewPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const [t, me] = await Promise.all([getTranslations("Dashboard"), getMe()]);
  // The layout has already sent a logged-out visitor to /login.
  const onlyOverview = me ? visibleNavKeys(me.access).length <= 1 : true;

  return (
    <>
      <PageHeader title={t("nav.overview")} sub={t("overviewSub")} />
      <div className="grid gap-3.5">
        {onlyOverview ? (
          <Card flat className="flex max-w-[560px] items-start gap-2 text-[13.5px] text-muted-foreground">
            <Info className="mt-0.5 size-[15px] flex-none" aria-hidden />
            {t("noAccess")}
          </Card>
        ) : null}
        <PlaceholderCard icon={LayoutDashboard} title={t("overviewTitle")} body={t("overviewBody")} />
      </div>
    </>
  );
}
