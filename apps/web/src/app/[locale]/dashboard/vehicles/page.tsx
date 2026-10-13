import { canAnywhere, formatNumber, VEHICLE_KINDS, VEHICLE_VIEWS, vehicleListQuery, type Locale } from "@s57/shared";
import { Car, Plus, TicketX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Card, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { VehiclesTable } from "@/components/vehicles/vehicles-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";
import { getVehicles } from "@/lib/api/vehicles";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Vehicles" });
  return { title: t("title") };
}

/** Vehicles in the user's area: on file by default, by number, kind, unit or person. */
export default async function VehiclesPage({ params, searchParams }: PageProps<"/[locale]/dashboard/vehicles">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("vehicles");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = vehicleListQuery.safeParse({
    q: text("q"),
    view: text("view"),
    kind: text("kind"),
    unitId: text("unitId"),
    personId: text("personId"),
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : vehicleListQuery.parse({ pageSize: PAGE_SIZE });
  const [t, list] = await Promise.all([getTranslations("Vehicles"), getVehicles(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.view !== "active" ? { view: query.view } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          list.can.create ? (
            <Link href="/dashboard/vehicles/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("add")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={Car} label={t("stats.active")} value={formatNumber(list.counts.active, locale)} tone="acc" />
        <StatCard icon={TicketX} label={t("stats.noSticker")} value={formatNumber(list.counts.noSticker, locale)} tone="warn" />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.unitId ? <input type="hidden" name="unitId" value={query.unitId} /> : null}
        {query.personId ? <input type="hidden" name="personId" value={query.personId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="kind" defaultValue={query.kind ?? ""} aria-label={t("kindLabel")} className={`${inputClass} w-auto`}>
          <option value="">{t("allKinds")}</option>
          {VEHICLE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
        <select name="view" defaultValue={query.view} aria-label={t("viewLabel")} className={`${inputClass} w-auto`}>
          {VEHICLE_VIEWS.map((view) => (
            <option key={view} value={view}>
              {t(`view.${view}`)}
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

      <VehiclesTable rows={list.items} locale={locale} empty={t("empty")} personLinks={canAnywhere(me.access, "members")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/vehicles", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
