import { canAnywhere, formatNumber, STICKER_STATES, stickerListQuery, type Locale } from "@s57/shared";
import { BadgeCheck, CalendarX, Download } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Field, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { StickerList } from "@/components/vehicles/sticker-list";
import { StickerSettingsCard } from "@/components/vehicles/sticker-settings";
import { getChargeTypes } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";
import { getStickers, getStickerSettings, stickersCsvHref } from "@/lib/api/vehicles";

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/stickers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Vehicles.tabs" });
  return { title: t("stickers") };
}

/**
 * Stickers in the user's area by number, state or last day; the ticked ones renewed together or
 * printed on A4; the CSV; and the society's sticker setting. Issuing one is on the vehicle's page.
 */
export default async function StickersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/vehicles/stickers">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("vehicles");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = stickerListQuery.safeParse({
    q: text("q"),
    state: text("state"),
    validUntilBy: text("validUntilBy"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : stickerListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, tTabs, list, settings] = await Promise.all([getTranslations("Vehicles"), getTranslations("Vehicles.tabs"), getStickers(query), getStickerSettings()]);
  const chargeTypes = settings.can.edit && canAnywhere(me.access, "billing") ? (await getChargeTypes()).items : null;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.state ? { state: query.state } : {}),
    ...(query.validUntilBy ? { validUntilBy: query.validUntilBy } : {}),
  };

  return (
    <>
      <PageHeader
        title={tTabs("stickers")}
        sub={t("stickersSub")}
        actions={
          list.can.export ? (
            <a href={stickersCsvHref({ ...filters, lang: locale })} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden />
              {t("csv")}
            </a>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={BadgeCheck} label={t("stats.inForce")} value={formatNumber(list.counts.active, locale)} tone="info" />
        <StatCard icon={CalendarX} label={t("stats.expired")} value={formatNumber(list.counts.expired, locale)} tone="warn" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("stickerSearchPlaceholder")} aria-label={t("stickerSearchLabel")} />
        <select name="state" defaultValue={query.state ?? ""} aria-label={t("col.state")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStates")}</option>
          {STICKER_STATES.map((state) => (
            <option key={state} value={state}>
              {t(`stickerState.${state}`)}
            </option>
          ))}
        </select>
        <Field label={t("validUntilBy")} htmlFor="sticker-valid-by">
          <input id="sticker-valid-by" type="date" name="validUntilBy" defaultValue={query.validUntilBy ?? ""} className={`${inputClass} w-auto`} />
        </Field>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <StickerList key={JSON.stringify(query)} rows={list.items} canIssue={list.can.issue} empty={Object.keys(filters).length ? t("stickersEmpty") : t("stickersStart")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/vehicles/stickers", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />

      <div className="mt-3.5">
        <StickerSettingsCard view={settings} chargeTypes={chargeTypes} />
      </div>
    </>
  );
}
