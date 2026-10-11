import {
  canAnywhere,
  formatDate,
  NOTICE_CATEGORIES,
  NOTICE_STATUSES,
  noticeAdminListQuery,
  pick,
  type Locale,
  type NoticeAdmin,
} from "@s57/shared";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NoticeStatusChip } from "@/components/cms/status-chips";
import { Pager } from "@/components/cms/pager";
import { Chip, DataTable, inputClass, PageHeader, SearchInput, type Column } from "@/components/kit";
import { NOTICE_CATEGORY_STYLE } from "@/components/site/notice-category";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getNoticesAdmin } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/notices">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.notices") };
}

/** Every notice of the society, including private and scheduled ones. */
export default async function NoticesAdminPage({ params, searchParams }: PageProps<"/[locale]/dashboard/notices">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("notices");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = noticeAdminListQuery.safeParse({
    q: typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined,
    category: search["category"] || undefined,
    status: search["status"] || undefined,
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tCat, tDash, list] = await Promise.all([
    getTranslations("Cms.notices"),
    getTranslations("Notices.category"),
    getTranslations("Dashboard"),
    getNoticesAdmin(query),
  ]);

  const columns: Column<NoticeAdmin>[] = [
    {
      key: "title",
      header: t("title"),
      cell: (notice) => (
        <Link href={`/dashboard/notices/${notice.id}`} className="font-semibold whitespace-normal text-fg">
          {pick(notice.titleBn, notice.titleEn, locale)}
        </Link>
      ),
    },
    {
      key: "category",
      header: t("category"),
      cell: (notice) => (
        <Chip tone={NOTICE_CATEGORY_STYLE[notice.category].tone} plain>
          {tCat(notice.category)}
        </Chip>
      ),
    },
    { key: "status", header: t("status"), cell: (notice) => <NoticeStatusChip status={notice.status} /> },
    { key: "publishAt", header: t("publishAt"), cell: (notice) => formatDate(notice.publishAt, locale, "stamp") },
    { key: "createdBy", header: t("createdBy"), cell: (notice) => notice.createdByName ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title={tDash("nav.notices")}
        sub={t("sub")}
        actions={
          canAnywhere(me.access, "notices", "create") ? (
            <Link href="/dashboard/notices/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="category" defaultValue={query.category ?? ""} aria-label={t("category")} className={`${inputClass} w-auto`}>
          <option value="">{t("allCategories")}</option>
          {NOTICE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {tCat(category)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("status")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatuses")}</option>
          {NOTICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(notice) => notice.id} caption={tDash("nav.notices")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={Math.max(1, Math.ceil(list.total / PAGE_SIZE))}
        href={(target) => ({
          pathname: "/dashboard/notices",
          query: {
            ...(query.q ? { q: query.q } : {}),
            ...(query.category ? { category: query.category } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(target > 1 ? { page: String(target) } : {}),
          },
        })}
      />
    </>
  );
}
