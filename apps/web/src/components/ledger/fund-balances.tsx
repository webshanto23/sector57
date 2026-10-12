import { compareMoney, formatTaka, pick, type Fund, type Locale } from "@s57/shared";
import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, Chip } from "@/components/kit";
import { Link } from "@/i18n/navigation";

const negative = (amount: string) => compareMoney(amount, "0") < 0;

/**
 * What each fund holds now, in cash and at the bank. A fund below zero (a receipt or
 * donation voided after its cash was spent) shows in red. Each card opens that fund's statement.
 */
export async function FundBalances({ funds, locale, selected }: { funds: Fund[]; locale: Locale; selected: string | null }) {
  const t = await getTranslations("Ledger");
  const tFunds = await getTranslations("Finance.funds");
  const shown = funds.filter((fund) => !fund.closedAt || fund.balance.total !== "0.00");
  const money = (amount: string) => <span className={cn("num", negative(amount) && "font-semibold text-bad")}>{formatTaka(amount, locale)}</span>;

  return (
    <section aria-label={t("balances")} className="mb-4 grid gap-2.5 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-3">
      {shown.map((fund) => {
        const below = negative(fund.balance.cash) || negative(fund.balance.bank);
        return (
          <Link key={fund.id} href={{ pathname: "/dashboard/ledger", query: { fundId: fund.id } }} className="block">
            <Card className={cn("grid gap-2", selected === fund.id && "border-primary", below && "border-bad")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{pick(fund.nameBn, fund.nameEn, locale)}</b>
                {fund.closedAt ? <Chip>{t("closedFund")}</Chip> : fund.isDefault ? <Chip tone="acc">{tFunds("default")}</Chip> : null}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[13px]">
                <div>
                  <dt className="text-muted-foreground">{tFunds("cash")}</dt>
                  <dd>{money(fund.balance.cash)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tFunds("bank")}</dt>
                  <dd>{money(fund.balance.bank)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tFunds("total")}</dt>
                  <dd className="font-semibold">{money(fund.balance.total)}</dd>
                </div>
              </dl>
              {below ? (
                <p className="flex items-start gap-1.5 text-[12.5px] text-bad">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {t("belowZero")}
                </p>
              ) : null}
            </Card>
          </Link>
        );
      })}
    </section>
  );
}
