import { compareMoney, formatDate, formatNumber, formatTaka, HANDOVER_STATUSES, handoverListQuery, subtractMoney, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { HandoverConfirm } from "@/components/collect/handover-confirm";
import { Card, Chip, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getHandovers } from "@/lib/api/payments";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/collect/handovers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Collect.handover" });
  return { title: t("title") };
}

/** Cash handovers, waiting ones first. An approver who isn't the collector counts and confirms. */
export default async function HandoversPage({ params, searchParams }: PageProps<"/[locale]/dashboard/collect/handovers">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("payments");
  const search = await searchParams;
  const parsed = handoverListQuery.safeParse({ status: search["status"] || undefined, page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, tNav, list] = await Promise.all([getTranslations("Collect.handover"), getTranslations("Dashboard.nav"), getHandovers(query)]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const n = (value: number) => formatNumber(value, locale);
  const tabs = [undefined, ...HANDOVER_STATUSES] as const;

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

      <nav className="mb-3.5 flex flex-wrap gap-2" aria-label={t("title")}>
        {tabs.map((status) => (
          <Link
            key={status ?? "all"}
            href={{ pathname: "/dashboard/collect/handovers", query: status ? { status } : {} }}
            aria-current={query.status === status ? "page" : undefined}
            className={buttonVariants({ variant: query.status === status ? "default" : "outline", size: "sm" })}
          >
            {status ? t(status) : t("all")}
          </Link>
        ))}
      </nav>

      {list.items.length === 0 ? (
        <Card className="text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ul className="grid gap-3">
          {list.items.map((handover) => {
            const sign = handover.difference === null ? 0 : compareMoney(handover.difference, "0");
            return (
              <li key={handover.id}>
                <Card className="grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{handover.collector.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {t("createdAt", { date: formatDate(handover.createdAt, locale, "stamp") })} · {t("receipts", { count: n(handover.paymentCount) })}
                      </p>
                    </div>
                    {handover.status === "pending" ? <Chip tone="warn">{t("pending")}</Chip> : <Chip tone="good">{t("confirmed")}</Chip>}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3">
                    <div>
                      <dt className="text-[12.5px] text-muted-foreground">{t("expected")}</dt>
                      <dd className="num text-lg font-bold">{formatTaka(handover.expected, locale)}</dd>
                    </div>
                    {handover.counted !== null ? (
                      <>
                        <div>
                          <dt className="text-[12.5px] text-muted-foreground">{t("counted")}</dt>
                          <dd className="num text-lg font-bold">{formatTaka(handover.counted, locale)}</dd>
                        </div>
                        <div>
                          <dt className="text-[12.5px] text-muted-foreground">{t("difference")}</dt>
                          <dd className={`num font-semibold ${sign === 0 ? "text-good" : "text-bad"}`}>
                            {sign === 0
                              ? t("exact")
                              : sign < 0
                                ? t("short", { amount: formatTaka(subtractMoney("0", handover.difference!), locale) })
                                : t("over", { amount: formatTaka(handover.difference!, locale) })}
                          </dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                  {handover.note ? <p className="text-[13.5px]">{handover.note}</p> : null}
                  {handover.confirmedBy && handover.confirmedAt ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      {t("confirmedBy", { name: handover.confirmedBy, date: formatDate(handover.confirmedAt, locale, "stamp") })}
                    </p>
                  ) : null}
                  {handover.can.confirm ? (
                    <HandoverConfirm id={handover.id} expected={handover.expected} />
                  ) : handover.status === "pending" && handover.collector.id === me.id ? (
                    <p className="text-[12.5px] text-muted-foreground">{t("own")}</p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/collect/handovers",
          query: { ...(query.status ? { status: query.status } : {}), ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
