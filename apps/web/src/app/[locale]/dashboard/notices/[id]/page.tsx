import { canAnywhere, formatDate, pick, type Locale } from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NoticeForm } from "@/components/cms/notice-form";
import { NoticeStatusChip } from "@/components/cms/status-chips";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getNoticeAdmin } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/notices/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("notices");
  const notice = await getNoticeAdmin(id);
  return notice ? { title: pick(notice.titleBn, notice.titleEn, locale as Locale) } : {};
}

/** One notice: edit it, see where it stands, open it on the website. */
export default async function NoticePage({ params }: PageProps<"/[locale]/dashboard/notices/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("notices");
  const [t, notice] = await Promise.all([getTranslations("Cms.notices"), getNoticeAdmin(id)]);
  if (!notice) notFound();

  return (
    <>
      <PageHeader
        title={pick(notice.titleBn, notice.titleEn, locale)}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <NoticeStatusChip status={notice.status} />
            {formatDate(notice.publishAt, locale, "stamp")}
          </span>
        }
        actions={
          <>
            {notice.status === "published" ? (
              <Link href={`/notices/${notice.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
                <ExternalLink aria-hidden />
                {t("viewOnSite")}
              </Link>
            ) : null}
            <Link href="/dashboard/notices" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("backToList")}
            </Link>
          </>
        }
      />
      <NoticeForm
        key={`${notice.id}:${notice.publishAt}`}
        notice={notice}
        canSave={canAnywhere(me.access, "notices", "edit")}
        canDelete={canAnywhere(me.access, "notices", "delete")}
      />
    </>
  );
}
