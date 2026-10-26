import { canAnywhere, FORM_KEYS, FORM_STATUSES, formatDate, formatNumber, formListQuery, localDigits, type FormRow, type Locale } from "@s57/shared";
import { CircleCheck, CircleX, Inbox, SearchCheck, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { FormStatusChip } from "@/components/forms-admin/labels";
import { Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { placeText } from "@/components/members/labels";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getForms } from "@/lib/api/forms";
import { getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/forms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.forms") };
}

/** Applications from the public website, newest first: counts per status, filters, and a table that becomes cards on phones. */
export default async function FormsQueuePage({ params, searchParams }: PageProps<"/[locale]/dashboard/forms">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("forms");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = formListQuery.safeParse({
    q: typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined,
    status: search["status"] || undefined,
    formKey: search["formKey"] || undefined,
    areaId: search["areaId"] || undefined,
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tForms, tNav, list, area] = await Promise.all([
    getTranslations("FormsAdmin"),
    getTranslations("Forms"),
    getTranslations("Dashboard.nav"),
    getForms(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.formKey ? { formKey: query.formKey } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);

  const columns: Column<FormRow>[] = [
    {
      key: "reference",
      header: t("col.reference"),
      cell: (row) => (
        <Link href={`/dashboard/forms/${row.id}`} className="num font-semibold tracking-wide text-fg underline-offset-2 hover:underline">
          {row.reference}
        </Link>
      ),
    },
    { key: "form", header: t("col.form"), cell: (row) => tForms(`kinds.${row.formKey}`) },
    { key: "name", header: t("col.name"), cell: (row) => <span className="font-medium whitespace-normal">{row.name}</span> },
    { key: "place", header: t("col.place"), cell: (row) => (row.place ? <span className="whitespace-normal">{placeText(row.place)}</span> : "—") },
    { key: "phone", header: t("col.phone"), cell: (row) => (row.phone ? <span className="num">{localDigits(row.phone, locale)}</span> : "—") },
    { key: "submitted", header: t("col.submitted"), cell: (row) => formatDate(row.submittedAt, locale, "short") },
    { key: "status", header: t("col.status"), cell: (row) => <FormStatusChip status={row.status} /> },
  ];

  return (
    <>
      <PageHeader title={tNav("forms")} sub={t("sub")} />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={Inbox} label={t("status.new")} value={n(list.counts.new)} tone="info" />
        <StatCard icon={SearchCheck} label={t("status.in_review")} value={n(list.counts.in_review)} tone="sun" />
        <StatCard icon={CircleCheck} label={t("status.approved")} value={n(list.counts.approved)} tone="acc" />
        <StatCard icon={CircleX} label={t("status.rejected")} value={n(list.counts.rejected)} tone="warn" />
      </div>

      {query.areaId ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
          <Chip tone="info" plain>
            {area?.location ? t("inArea", { name: area.location.name }) : t("inSomeArea")}
          </Chip>
          <Link
            href={{ pathname: "/dashboard/forms", query: { ...filters, areaId: undefined } }}
            className="inline-flex items-center gap-1 font-semibold text-primary"
          >
            <X className="size-3.5" aria-hidden />
            {t("clearArea")}
          </Link>
        </p>
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allStatuses")}</option>
          {FORM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select name="formKey" defaultValue={query.formKey ?? ""} aria-label={t("col.form")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allForms")}</option>
          {FORM_KEYS.map((key) => (
            <option key={key} value={key}>
              {tForms(`kinds.${key}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(row) => row.id} caption={tNav("forms")} empty={t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/forms",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
