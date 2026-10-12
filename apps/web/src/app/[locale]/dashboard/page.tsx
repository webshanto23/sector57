import {
  canAnywhere,
  formatDate,
  formatNumber,
  formatTaka,
  OVERVIEW_LOW_PERCENT,
  TIME_ZONE,
  type Locale,
  type Overview,
} from "@s57/shared";
import { Banknote, Building2, ClipboardList, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { Card, PageHeader, ProgressBar, StatCard } from "@/components/kit";
import { BilledChart } from "@/components/overview/billed-chart";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getOverview } from "@/lib/api/overview";
import { getMe } from "@/lib/api/session";
import { getBrand } from "@/lib/brand";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.overview") };
}

/** The part of the day in Dhaka, for the greeting. */
function partOfDay(now = new Date()): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(now));
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/**
 * Overview: open to every logged-in user. Each card shows only with its grant and counts only
 * the user's area (the API decides both); "Needs approval" lists what waits for their decision.
 */
export default async function OverviewPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, tDashboard, me, brand, view] = await Promise.all([
    getTranslations("Overview"),
    getTranslations("Dashboard"),
    getMe(),
    getBrand(locale),
    getOverview(),
  ]);
  // The layout has already sent a logged-out visitor to /login.
  const onlyOverview = me ? visibleNavKeys(me.access).length <= 1 : true;
  const name = me ? (locale === "en" ? (me.nameEn ?? me.name) : (me.name ?? me.nameEn)) : null;
  const greeting = t(`greeting.${partOfDay()}`);
  const money = (amount: string) => formatTaka(amount, locale);
  const n = (value: number) => formatNumber(value, locale);
  const month = formatDate(`${view.month}-01`, locale, "monthLong");

  const stats: ReactNode[] = [];
  if (view.collected) {
    const { amount, billed, percent } = view.collected;
    const note = billed === null ? t("receiptsOnly") : percent === null || billed === "0.00" ? t("nothingBilled") : t("ofBilled", { percent: n(percent) });
    stats.push(<StatCard key="collected" icon={Banknote} label={t("collected", { month })} value={money(amount)} note={note} />);
  }
  if (view.arrears) {
    stats.push(
      <StatCard key="arrears" icon={TriangleAlert} tone="sun" label={t("arrears")} value={money(view.arrears.owed)} note={t("unitsOverdue", { count: view.arrears.units })} />,
    );
  }
  if (view.occupancy) {
    stats.push(
      <StatCard
        key="occupancy"
        icon={Building2}
        tone="info"
        label={t("occupied")}
        value={n(view.occupancy.occupied)}
        note={t("vacantOf", { vacant: n(view.occupancy.vacant), units: n(view.occupancy.units) })}
      />,
    );
  }
  if (view.forms) {
    stats.push(<StatCard key="forms" icon={ClipboardList} tone="warn" label={t("pendingForms")} value={n(view.forms.open)} note={t("pendingFormsNote")} />);
  }

  return (
    <>
      <PageHeader
        title={name ? t("hello", { greeting, name }) : greeting}
        sub={t("sub", { society: brand.name, date: formatDate(view.asOf, locale) })}
        actions={
          me && canAnywhere(me.access, "notices", "create") ? (
            <Link href="/dashboard/notices/new" className={buttonVariants()}>
              {t("newNotice")}
            </Link>
          ) : null
        }
      />
      <div className="grid gap-3.5">
        {onlyOverview ? (
          <Card flat className="flex max-w-[560px] items-start gap-2 text-[13.5px] text-muted-foreground">
            <Info className="mt-0.5 size-[15px] flex-none" aria-hidden />
            {tDashboard("noAccess")}
          </Card>
        ) : null}

        {stats.length ? <div className="grid grid-cols-1 gap-3.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">{stats}</div> : null}

        {view.months || view.areas ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3.5">
            {view.months ? (
              <Card>
                <BilledChart months={view.months} locale={locale} />
              </Card>
            ) : null}
            {view.areas ? <AreasCard areas={view.areas} locale={locale} /> : null}
          </div>
        ) : null}

        {view.approvals ? (
          // Half the width on wider screens, like the mockup's lower row (its helpdesk and calendar cards come later).
          <div className="grid gap-3.5 min-[701px]:grid-cols-2">
            <ApprovalsCard approvals={view.approvals} locale={locale} />
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Mockup "Collection by block": this month's bills per area, below 80% in red. */
async function AreasCard({ areas, locale }: { areas: NonNullable<Overview["areas"]>; locale: Locale }) {
  const t = await getTranslations("Overview.areas");
  const pct = (value: number) => `${formatNumber(value, locale)}%`;
  return (
    <Card className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base min-[600px]:text-lg">{areas.parent ? t("titleIn", { place: areas.parent.name }) : t("title")}</h2>
        <Link
          href={{ pathname: "/dashboard/reports/collection", query: areas.parent ? { parentId: areas.parent.id } : {} }}
          className="text-[12.5px] font-medium text-primary"
        >
          {t("report")}
        </Link>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("note")}</p>
      {areas.items.length === 0 ? <p className="text-[13.5px] text-muted-foreground">{t("empty")}</p> : null}
      {areas.items.map((area) => {
        const low = area.percent < OVERVIEW_LOW_PERCENT;
        return (
          <div key={area.id} className="grid gap-1">
            <div className="flex justify-between gap-2 text-[13.5px]">
              <span className="min-w-0 truncate">{area.name}</span>
              <span className={low ? "num font-semibold text-bad" : "num"}>{pct(area.percent)}</span>
            </div>
            <ProgressBar value={area.percent} tone={low ? "bad" : "acc"} label={area.name} />
          </div>
        );
      })}
    </Card>
  );
}

type Approvals = NonNullable<Overview["approvals"]>;
type Item = { key: string; title: string; sub: string; href: string };

/** Mockup "Needs approval": the latest few of each kind, each opening its own page. */
async function ApprovalsCard({ approvals, locale }: { approvals: Approvals; locale: Locale }) {
  const [t, tKinds] = await Promise.all([getTranslations("Overview.approvals"), getTranslations("Forms.kinds")]);
  const when = (at: string) => formatDate(at, locale, "short");
  const groups: { key: string; count: number; items: Item[]; all: string }[] = [];
  if (approvals.expenses) {
    groups.push({
      key: "expenses",
      count: approvals.expenses.count,
      all: "/dashboard/expenses?status=pending",
      items: approvals.expenses.items.map((item) => ({
        key: item.id,
        title: `${t("expense", { description: item.description })}, ${formatTaka(item.amount, locale)}`,
        sub: item.requestedBy ? t("from", { name: item.requestedBy.name }) : when(item.at),
        href: `/dashboard/expenses/${item.id}`,
      })),
    });
  }
  if (approvals.handovers) {
    groups.push({
      key: "handovers",
      count: approvals.handovers.count,
      all: "/dashboard/collect/handovers?status=pending",
      items: approvals.handovers.items.map((item) => ({
        key: item.id,
        title: t("handover", { amount: formatTaka(item.amount, locale) }),
        sub: `${t("from", { name: item.collector.name })} · ${t("handoverNote", { count: item.payments })}`,
        href: "/dashboard/collect/handovers?status=pending",
      })),
    });
  }
  if (approvals.forms) {
    groups.push({
      key: "forms",
      count: approvals.forms.count,
      all: "/dashboard/forms",
      items: approvals.forms.items.map((item) => ({
        key: item.id,
        title: t("form", { kind: tKinds(item.formKey), reference: item.reference }),
        sub: [item.place, when(item.at)].filter(Boolean).join(" · "),
        href: `/dashboard/forms/${item.id}`,
      })),
    });
  }
  const empty = groups.every((group) => group.count === 0);

  return (
    <Card className="grid content-start gap-2.5">
      <h3 className="text-base">{t("title")}</h3>
      {empty ? <p className="text-[13.5px] text-muted-foreground">{t("empty")}</p> : null}
      {groups.map((group) => (
        <div key={group.key} className="contents">
          {group.items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
              <div className="min-w-0">
                <h4 className="truncate text-[14px] font-semibold">{item.title}</h4>
                <p className="truncate text-[12.5px] text-muted-foreground">{item.sub}</p>
              </div>
              <Link href={item.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("review")}
              </Link>
            </div>
          ))}
          {group.count > group.items.length ? (
            <Link href={group.all} className="text-[12.5px] font-medium text-primary">
              {t("more", { count: group.count - group.items.length })}
            </Link>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
