import { canAnywhere, CERTIFICATE_STATUSES, CERTIFICATE_TYPES, certificateListQuery, formatNumber, type Locale } from "@s57/shared";
import { Ban, FilePen, FileText, Plus, Stamp } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CertificatesTable } from "@/components/certificates/certificates-table";
import { Pager } from "@/components/cms/pager";
import { Card, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCertificates } from "@/lib/api/certificates";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/certificates">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Certificates" });
  return { title: t("title") };
}

/** Certificates and NOCs in the user's area, newest first, by number, person, type or status. */
export default async function CertificatesPage({ params, searchParams }: PageProps<"/[locale]/dashboard/certificates">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("certificates");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = certificateListQuery.safeParse({
    q: text("q"),
    type: text("type"),
    status: text("status"),
    unitId: text("unitId"),
    personId: text("personId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : certificateListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, list] = await Promise.all([getTranslations("Certificates"), getCertificates(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <>
            <Link href="/dashboard/certificates/templates" className={buttonVariants({ variant: "outline" })}>
              <FileText aria-hidden />
              {t("templatesLink")}
            </Link>
            {list.can.create ? (
              <Link href="/dashboard/certificates/new" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("add")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={FilePen} label={t("stats.draft")} value={formatNumber(list.counts.draft, locale)} tone="warn" />
        <StatCard icon={Stamp} label={t("stats.issued")} value={formatNumber(list.counts.issued, locale)} tone="acc" />
        <StatCard icon={Ban} label={t("stats.void")} value={formatNumber(list.counts.void, locale)} tone="sun" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.unitId ? <input type="hidden" name="unitId" value={query.unitId} /> : null}
        {query.personId ? <input type="hidden" name="personId" value={query.personId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="type" defaultValue={query.type ?? ""} aria-label={t("typeLabel")} className={`${inputClass} w-auto`}>
          <option value="">{t("allTypes")}</option>
          {CERTIFICATE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}`)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("statusLabel")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatuses")}</option>
          {CERTIFICATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      {list.total === 0 && Object.keys(filters).length === 0 ? (
        <Card flat className="mb-3.5 text-[13.5px] text-muted-foreground">
          {t("startHint")}
        </Card>
      ) : null}

      <CertificatesTable rows={list.items} locale={locale} empty={t("empty")} personLinks={canAnywhere(me.access, "members")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/certificates", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
