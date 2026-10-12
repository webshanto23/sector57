import { canAnywhere, formatTaka, localDigits, type Access, type Locale } from "@s57/shared";
import { HandHeart } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDonations } from "@/lib/api/donations";
import { DonationsTable } from "./donations-table";

const SHOWN = 10;

/** A person's or organisation's donations, newest first, on their page. Only with `donations.view`. */
export async function DonationsPanel({
  access,
  locale,
  personId,
  organisationId,
}: {
  access: Access;
  locale: Locale;
  personId?: string;
  organisationId?: string;
}) {
  if (!canAnywhere(access, "donations")) return null;
  const [t, list] = await Promise.all([getTranslations("Donations.panel"), getDonations({ personId, organisationId, pageSize: SHOWN })]);
  const filter = personId ? { personId } : { organisationId: organisationId! };
  const canCreate = canAnywhere(access, "donations", "create");
  // Hide the panel for someone who never gave, unless the viewer can record one here.
  if (list.total === 0 && !canCreate) return null;

  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("title")}</h2>
        {canCreate ? (
          <Link href={{ pathname: "/dashboard/donations/new", query: filter }} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <HandHeart aria-hidden />
            {t("record")}
          </Link>
        ) : null}
      </div>
      {list.totals.count > 0 ? <p className="num text-[13.5px] text-muted-foreground">{t("total", { amount: formatTaka(list.totals.amount, locale) })}</p> : null}
      <DonationsTable rows={list.items} locale={locale} showFund={list.totals.byFund.length > 1} empty={t("empty")} hide={["donor", "by"]} />
      {list.total > list.items.length ? (
        <Link href={{ pathname: "/dashboard/donations", query: filter }} className="justify-self-start text-[13.5px] font-semibold text-primary">
          {t("more", { count: localDigits(list.total - list.items.length, locale) })}
        </Link>
      ) : null}
    </Card>
  );
}
