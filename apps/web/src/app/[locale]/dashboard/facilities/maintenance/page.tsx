import { maintenanceDueQuery, pick, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { AssetStatusChip } from "@/components/facilities/asset-status";
import { DueChip, MarkDone } from "@/components/facilities/plans-card";
import { Card, inputClass, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMaintenanceDue } from "@/lib/api/facilities";

const WINDOWS = [7, 30, 90, 365] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/maintenance">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Facilities.tabs" });
  return { title: t("maintenance") };
}

/** Upkeep overdue or due soon in the user's area, soonest first, with "done" for those who may mark it. */
export default async function MaintenanceDuePage({ params, searchParams }: PageProps<"/[locale]/dashboard/facilities/maintenance">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const search = await searchParams;
  const parsed = maintenanceDueQuery.safeParse({ within: search["within"] ?? undefined, areaId: search["areaId"] ?? undefined });
  const query = parsed.success ? parsed.data : maintenanceDueQuery.parse({});
  const [t, tTabs, due] = await Promise.all([getTranslations("Assets"), getTranslations("Facilities.tabs"), getMaintenanceDue(query)]);
  if (!due) notFound();

  return (
    <>
      <PageHeader title={tTabs("maintenance")} sub={t("dueSub")} />

      <form method="get" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <select name="within" defaultValue={String(query.within)} aria-label={t("withinLabel")} className={`${inputClass} sm:w-auto!`}>
          {WINDOWS.map((days) => (
            <option key={days} value={days}>
              {t("within", { days })}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      {due.truncated ? <Note tone="warn">{t("dueTruncated")}</Note> : null}
      {due.items.length === 0 ? (
        <Card flat className="text-[13.5px] text-muted-foreground">
          {t("dueNone")}
        </Card>
      ) : (
        <ul className="grid gap-2.5">
          {due.items.map(({ plan, asset, canMark }) => (
            <li key={plan.id}>
              <Card className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid">
                    <span className="font-semibold">{pick(plan.task.bn, plan.task.en, locale)}</span>
                    <Link href={`/dashboard/facilities/assets/${asset.id}`} className="text-[13.5px]">
                      <span className="num">{asset.assetNo}</span> · {pick(asset.name.bn, asset.name.en, locale)}
                    </Link>
                    <span className="text-[12.5px] text-muted-foreground">
                      {[asset.facility ? pick(asset.facility.bn, asset.facility.en, locale) : null, [...asset.place.address, asset.place.name].join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                      {asset.custodian ? ` · ${t("keptBy", { name: pick(asset.custodian.name, asset.custodian.nameEn, locale) })}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {asset.status !== "in_use" ? <AssetStatusChip status={asset.status} /> : null}
                    <DueChip nextDueOn={plan.nextDueOn} today={due.today} />
                  </div>
                </div>
                {canMark ? <MarkDone planId={plan.id} today={due.today} lastDoneOn={plan.lastDoneOn} /> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
