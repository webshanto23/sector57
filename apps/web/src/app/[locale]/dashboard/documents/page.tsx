import { DOCUMENT_TYPES, documentListQuery, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { DocumentsList } from "@/components/documents/documents-list";
import { Card, inputClass, PageHeader, SearchInput } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDocuments } from "@/lib/api/documents";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/documents">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.documents") };
}

/** The society's papers (minutes, AGM papers, circulars, licences), newest first; archived ones on their own tab. */
export default async function DocumentsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/documents">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("documents");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = documentListQuery.safeParse({
    entityType: "society",
    q: text("q"),
    docType: text("docType"),
    archived: text("archived") ?? "false",
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : documentListQuery.parse({ entityType: "society", pageSize: PAGE_SIZE });
  const [t, tNav, list] = await Promise.all([getTranslations("Documents"), getTranslations("Dashboard.nav"), getDocuments(query)]);
  if (!list) notFound();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.docType ? { docType: query.docType } : {}),
    ...(query.archived ? { archived: "true" } : {}),
  };

  return (
    <>
      <PageHeader title={tNav("documents")} sub={t("sub")} />

      <nav className="mb-3.5 flex flex-wrap gap-2" aria-label={tNav("documents")}>
        {[false, true].map((archived) => (
          <Link
            key={String(archived)}
            href={{ pathname: "/dashboard/documents", query: archived ? { archived: "true" } : {} }}
            aria-current={query.archived === archived ? "page" : undefined}
            className={buttonVariants({ variant: query.archived === archived ? "default" : "outline", size: "sm" })}
          >
            {archived ? t("tabArchived") : t("tabCurrent")}
          </Link>
        ))}
      </nav>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.archived ? <input type="hidden" name="archived" value="true" /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="docType" defaultValue={query.docType ?? ""} aria-label={t("docType")} className={`${inputClass} w-auto`}>
          <option value="">{t("allTypes")}</option>
          {DOCUMENT_TYPES.society.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <Card className="grid gap-3">
        <DocumentsList list={list} entityType="society" archived={query.archived} />
      </Card>

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/documents", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
