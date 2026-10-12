import { directoryAllQuery, DIRECTORY_EXPORT_LIMIT, formatNumber, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DirectoryPrint } from "@/components/directory/directory-print";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDirectoryPrint } from "@/lib/api/moves";
import { requirePermission } from "@/lib/api/session";
import { getBrand } from "@/lib/brand";
import { todayInDhaka } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/directory/print">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Directory" });
  return { title: t("printTitle") };
}

/** The resident directory of one area (or the user's whole area) as an A4 sheet for a door-to-door check. */
export default async function DirectoryPrintPage({ params, searchParams }: PageProps<"/[locale]/dashboard/directory/print">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("members");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = directoryAllQuery.safeParse({ q: text("q"), areaId: text("areaId") });
  const query = parsed.success ? parsed.data : {};
  const [t, brand, list] = await Promise.all([getTranslations("Directory"), getBrand(locale), getDirectoryPrint(query)]);
  if (!list) notFound();
  const back = { pathname: "/dashboard/directory", query: { ...(query.q ? { q: query.q } : {}), ...(query.areaId ? { areaId: query.areaId } : {}) } };

  return (
    <>
      <PageHeader
        title={t("printTitle")}
        sub={list.area ? t("printPlace", { place: list.area.name }) : undefined}
        actions={
          <>
            <Link href={back} className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("back")}
            </Link>
            <DirectoryPrint list={list} society={brand.name} today={todayInDhaka()} />
          </>
        }
      />
      {list.truncated ? (
        <div className="mb-3.5">
          <Note tone="warn">{t("truncated", { count: formatNumber(DIRECTORY_EXPORT_LIMIT, locale) })}</Note>
        </div>
      ) : null}
      <Card flat className="text-[13.5px] text-muted-foreground">
        {list.items.length === 0 ? t("empty") : `${t("stats.residents")}: ${formatNumber(list.items.length, locale)}`}
      </Card>
    </>
  );
}
