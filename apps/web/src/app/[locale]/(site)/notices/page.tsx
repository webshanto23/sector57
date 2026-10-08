import { localDigits, noticeCategory, type Locale } from "@s57/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageHeader } from "@/components/kit";
import { CategoryFilter } from "@/components/site/category-filter";
import { NoticeCard } from "@/components/site/notice-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getNotices } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: PageProps<"/[locale]/notices">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Notices" });
  return { title: t("title"), description: t("sub"), alternates: alternates("/notices", locale as Locale) };
}

/** Public notice board (mockup `PUB.notices`) with category filter and paging. */
export default async function NoticesPage({ params, searchParams }: PageProps<"/[locale]/notices">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const query = await searchParams;
  // Ignore a bad filter or page number rather than failing the page.
  const parsedCategory = noticeCategory.safeParse(query["category"]);
  const category = parsedCategory.success ? parsedCategory.data : undefined;
  const pageParam = Number(query["page"]);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const [t, common, list] = await Promise.all([
    getTranslations("Notices"),
    getTranslations("Common"),
    getNotices({ category, page, pageSize: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const pageHref = (target: number) => ({
    pathname: "/notices" as const,
    query: { ...(category ? { category } : {}), ...(target > 1 ? { page: String(target) } : {}) },
  });

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} actions={<CategoryFilter value={category} />} />

      {list.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t("empty")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 min-[701px]:grid-cols-2">
          {list.items.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} locale={locale} />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label={common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) })} className="mt-5 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline" })} rel="prev">
              <ChevronLeft aria-hidden />
              {common("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) })}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline" })} rel="next">
              {common("next")}
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
