import { formatDate, formatNumber, pick, type Locale } from "@s57/shared";
import { Boxes, ChevronLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { ArchiveCard, FacilityEditor } from "@/components/facilities/facility-form";
import { Card, Chip, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFacility, getFacilityFunds } from "@/lib/api/facilities";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("facilities");
  const facility = await getFacility(id);
  return facility ? { title: facility.name.bn } : {};
}

/** One facility: its details and place, its assets, archiving. */
export default async function FacilityPage({ params }: PageProps<"/[locale]/dashboard/facilities/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("facilities");
  const [t, facility] = await Promise.all([getTranslations("Facilities"), getFacility(id)]);
  if (!facility) notFound();
  const funds = facility.can.edit ? await getFacilityFunds() : null;
  const placeLine = [...facility.place.address, facility.place.name].join(", ");

  return (
    <>
      <PageHeader
        title={pick(facility.name.bn, facility.name.en, locale)}
        sub={[t(`kind.${facility.kind}`), placeLine].join(" · ")}
        actions={
          <Link href="/dashboard/facilities" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {facility.archivedAt ? (
            <Chip>{t("archivedOn", { date: formatDate(facility.archivedAt, locale, "short") })}</Chip>
          ) : (
            <Chip tone="good">{t("inUse")}</Chip>
          )}
          {facility.bookable ? <Chip tone="info">{t("bookable")}</Chip> : null}
          {facility.fund ? <Chip tone="acc" plain>{pick(facility.fund.name.bn, facility.fund.name.en, locale)}</Chip> : null}
        </div>

        {facility.archivedAt ? <Note>{t("archivedNote")}</Note> : !facility.can.edit ? <Note>{t("readOnly")}</Note> : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {facility.can.edit && funds ? (
            <FacilityEditor key={facility.id} facility={facility} funds={funds} />
          ) : (
            <Card className="grid gap-2">
              <h2 className="text-[15px]">{t("details")}</h2>
              <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
                {(
                  [
                    [t("kindLabel"), t(`kind.${facility.kind}`)],
                    [t("placeTitle"), placeLine],
                    [t("fundLabel"), facility.fund ? pick(facility.fund.name.bn, facility.fund.name.en, locale) : "—"],
                    [t("note"), facility.note ?? "—"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          <div className="grid content-start gap-3.5">
            <Card className="grid gap-2.5">
              <h2 className="text-[15px]">{t("assetsHere")}</h2>
              <p className="text-[13px] text-muted-foreground">{t("assetsCount", { count: facility.assets, shown: formatNumber(facility.assets, locale) })}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={{ pathname: "/dashboard/facilities/assets", query: { facilityId: facility.id } }} className={buttonVariants({ variant: "outline" })}>
                  <Boxes aria-hidden />
                  {t("openAssets")}
                </Link>
                {facility.can.addAsset ? (
                  <Link href={{ pathname: "/dashboard/facilities/assets/new", query: { facilityId: facility.id } }} className={buttonVariants({ variant: "outline" })}>
                    <Plus aria-hidden />
                    {t("addAsset")}
                  </Link>
                ) : null}
              </div>
            </Card>
            {facility.can.archive ? <ArchiveCard facility={facility} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}
