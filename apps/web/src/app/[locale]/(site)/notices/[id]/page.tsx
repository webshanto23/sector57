import { formatDate, pick, type Locale } from "@s57/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Card, Chip, IconBox } from "@/components/kit";
import { NOTICE_CATEGORY_STYLE } from "@/components/site/notice-category";
import { Link } from "@/i18n/navigation";
import { getNotice } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

// None are built ahead; each notice is rendered on its first visit, then cached like the other public pages.
export function generateStaticParams() {
  return [];
}

// generateMetadata and the page share one API call per request.
const loadNotice = cache(getNotice);

export async function generateMetadata({ params }: PageProps<"/[locale]/notices/[id]">): Promise<Metadata> {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  const notice = await loadNotice(id);
  if (!notice) return {};
  return {
    title: pick(notice.titleBn, notice.titleEn, locale),
    description: pick(notice.bodyBn, notice.bodyEn, locale).slice(0, 160),
    alternates: alternates(`/notices/${id}`, locale),
  };
}

/** One public notice in full. */
export default async function NoticePage({ params }: PageProps<"/[locale]/notices/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const notice = await loadNotice(id);
  if (!notice) notFound();

  const t = await getTranslations("Notices");
  const style = NOTICE_CATEGORY_STYLE[notice.category];

  return (
    <article className="mx-auto grid max-w-[760px] gap-3.5">
      <Link href="/notices" className="inline-flex items-center gap-1 text-[13.5px] font-semibold no-underline">
        <ArrowLeft className="size-[15px]" aria-hidden />
        {t("backToList")}
      </Link>
      <Card className="grid gap-3.5 min-[600px]:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <IconBox icon={style.icon} tone={style.iconTone} />
          <Chip tone={style.tone}>{t(`category.${notice.category}`)}</Chip>
          <time dateTime={notice.publishAt} className="ml-auto text-xs text-muted-foreground">
            {t("published", { date: formatDate(notice.publishAt, locale) })}
          </time>
        </div>
        <h1 className="font-display text-[clamp(22px,3vw,28px)] leading-[1.4]">{pick(notice.titleBn, notice.titleEn, locale)}</h1>
        <div className="whitespace-pre-line">{pick(notice.bodyBn, notice.bodyEn, locale)}</div>
      </Card>
    </article>
  );
}
