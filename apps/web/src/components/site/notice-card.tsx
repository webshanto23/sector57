import { formatDate, pick, type Locale, type Notice } from "@s57/shared";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, Chip, IconBox } from "@/components/kit";
import { Link } from "@/i18n/navigation";
import { NOTICE_CATEGORY_STYLE } from "./notice-category";

/** Mockup notice-board card: icon and category chip, date, title, body excerpt, read link. */
export async function NoticeCard({ notice, locale }: { notice: Notice; locale: Locale }) {
  const t = await getTranslations("Notices");
  const style = NOTICE_CATEGORY_STYLE[notice.category];
  const title = pick(notice.titleBn, notice.titleEn, locale);

  return (
    <article>
      <Card className="grid h-full content-start gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconBox icon={style.icon} tone={style.iconTone} />
            <Chip tone={style.tone}>{t(`category.${notice.category}`)}</Chip>
          </div>
          <time dateTime={notice.publishAt} className="text-xs whitespace-nowrap text-muted-foreground">
            {formatDate(notice.publishAt, locale)}
          </time>
        </div>
        <h3>{title}</h3>
        <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">
          {pick(notice.bodyBn, notice.bodyEn, locale)}
        </p>
        <Link
          href={`/notices/${notice.id}`}
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold no-underline"
          aria-label={`${t("readNotice")}: ${title}`}
        >
          {t("readNotice")}
          <ArrowRight className="size-[15px]" aria-hidden />
        </Link>
      </Card>
    </article>
  );
}
