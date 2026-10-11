import { formatNumber, formatTaka, paymentListQuery, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { ReceiptsTable } from "@/components/collect/receipts-table";
import { Field, inputClass, PageHeader, SearchInput } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPayments } from "@/lib/api/payments";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/collect/receipts">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Collect.list" });
  return { title: t("title") };
}

/** Every receipt in the caller's area, newest first, with dates, status and search. */
export default async function ReceiptsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/collect/receipts">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("payments");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = paymentListQuery.safeParse({
    q: text("q"),
    from: text("from"),
    to: text("to"),
    status: text("status"),
    collectorId: text("collectorId"),
    unitId: text("unitId"),
    personId: text("personId"),
    invoiceId: text("invoiceId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, list] = await Promise.all([getTranslations("Collect.list"), getTranslations("Dashboard.nav"), getPayments(query)]);
  const filters = Object.fromEntries(
    (["q", "from", "to", "status", "collectorId", "unitId", "personId", "invoiceId"] as const).flatMap((key) => (query[key] ? [[key, query[key]]] : [])),
  ) as Record<string, string>;
  const filtered = Object.keys(filters).length > 0;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <Link href="/dashboard/collect" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tNav("collect")}
          </Link>
        }
      />

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {(["unitId", "personId", "invoiceId"] as const).map((key) => (query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null))}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <Field label={t("from")} htmlFor="from">
          <input id="from" type="date" name="from" defaultValue={query.from ?? ""} className={`${inputClass} w-auto`} />
        </Field>
        <Field label={t("to")} htmlFor="to">
          <input id="to" type="date" name="to" defaultValue={query.to ?? ""} className={`${inputClass} w-auto`} />
        </Field>
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatus")}</option>
          <option value="valid">{t("valid")}</option>
          <option value="void">{t("void")}</option>
        </select>
        <label className="flex items-center gap-2 py-2 text-[13.5px]">
          <input type="checkbox" name="collectorId" value="me" defaultChecked={query.collectorId === "me"} className="size-4 accent-[var(--accent-brand)]" />
          {t("mine")}
        </label>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <p className="num mb-2.5 text-[13.5px] text-muted-foreground">
        {t("totals", { count: n(list.totals.count), amount: formatTaka(list.totals.amount, locale) })}
        {list.totals.voidCount ? ` · ${t("voidCount", { count: n(list.totals.voidCount) })}` : null}
      </p>

      <ReceiptsTable rows={list.items} locale={locale} empty={filtered ? t("emptyFiltered") : t("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/collect/receipts",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
