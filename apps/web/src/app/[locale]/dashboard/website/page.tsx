import { canAnywhere, EDITABLE_PAGES, formatDate, type Locale } from "@s57/shared";
import { ChevronRight, House, Info, Landmark } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Grid, IconBox, PageHeader } from "@/components/kit";
import { Link, redirect } from "@/i18n/navigation";
import { getSitePageAdmin } from "@/lib/api/cms";
import { getMe } from "@/lib/api/session";

const ICONS = { home: House, site: Info, developments: Landmark } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/website">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.website") };
}

/** The editable pages. Without `site.view` the section opens on the first tab the user may see. */
export default async function WebsitePage({ params }: PageProps<"/[locale]/dashboard/website">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  // The layout has already answered 404 when no tab is allowed.
  const me = (await getMe())!;
  if (!canAnywhere(me.access, "site")) {
    redirect({ href: canAnywhere(me.access, "committee") ? "/dashboard/website/committee" : "/dashboard/website/gallery", locale });
  }

  const [t, tDash, pages] = await Promise.all([
    getTranslations("Cms.pages"),
    getTranslations("Dashboard"),
    Promise.all(EDITABLE_PAGES.map((slug) => getSitePageAdmin(slug))),
  ]);

  return (
    <>
      <PageHeader title={tDash("nav.website")} sub={t("sub")} />
      <Grid cols={3}>
        {pages.map((page) => (
          <Link key={page.slug} href={`/dashboard/website/pages/${page.slug}`} className="group rounded-[12px]">
            <Card className="flex h-full items-start gap-3 transition-colors group-hover:border-primary">
              <IconBox icon={ICONS[page.slug]} size="sm" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px]">{t(`${page.slug}.title`)}</h2>
                <p className="text-[13px] text-muted-foreground">{t(`${page.slug}.sub`)}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {page.updatedAt ? t("updated", { date: formatDate(page.updatedAt, locale, "short") }) : t("notCreated")}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Card>
          </Link>
        ))}
      </Grid>
    </>
  );
}
