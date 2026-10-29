import { addMonths, canAnywhere, localDigits, MAX_BILL_AHEAD_MONTHS, monthOfDay, type Access, type Locale } from "@s57/shared";
import { Banknote, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoices, lookupBilling } from "@/lib/api/billing";
import { getChargeTypes } from "@/lib/api/finance";
import { dhakaDay, todayInDhaka } from "@/lib/dhaka-time";
import { BillAhead } from "./bill-ahead";
import { BillsTable } from "./bills-table";
import { OpeningForm } from "./opening-form";

const SHOWN = 10;

/**
 * The latest bills of a unit or of a person, within the caller's billing area. On a unit
 * page it also offers a new bill and, once per unit, the earlier arrears.
 */
export async function BillsPanel({
  access,
  locale,
  unitId,
  personId,
  organisationId,
}: {
  access: Access;
  locale: Locale;
  unitId?: string;
  personId?: string;
  organisationId?: string;
}) {
  if (!canAnywhere(access, "billing")) return null;
  const canCreate = Boolean(unitId) && canAnywhere(access, "billing", "create");
  const [t, list, lookup, chargeTypes] = await Promise.all([
    getTranslations("Billing"),
    getInvoices({ unitId, personId, organisationId, pageSize: SHOWN }),
    canCreate ? lookupBilling({ unitId }) : Promise.resolve(null),
    canCreate ? getChargeTypes() : Promise.resolve(null),
  ]);
  // Null when the unit is outside the caller's billing area.
  const unit = lookup?.units[0] ?? null;
  const filter = unitId ? { unitId } : personId ? { personId } : { organisationId: organisationId! };
  // Cash for a unit's bills; a person's or organisation's are their membership fees (the collect page checks who may take those).
  const collect = canAnywhere(access, "payments", "create") && list.items.some((bill) => bill.due !== "0.00");
  const thisMonth = monthOfDay(todayInDhaka());

  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("panel.title")}</h2>
        <div className="flex flex-wrap gap-2">
          {collect ? (
            <Link
              href={{ pathname: "/dashboard/collect", query: filter }}
              className={buttonVariants({ size: "sm" })}
            >
              <Banknote aria-hidden />
              {t("panel.collect")}
            </Link>
          ) : null}
          {unit?.billTo && unit.isActive ? (
            <Link href={{ pathname: "/dashboard/billing/new", query: { unitId } }} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Plus aria-hidden />
              {t("panel.newForUnit")}
            </Link>
          ) : null}
        </div>
      </div>
      <BillsTable rows={list.items} locale={locale} empty={t("panel.empty")} hide={unitId ? ["unit"] : ["billTo"]} />
      {list.total > list.items.length ? (
        <Link href={{ pathname: "/dashboard/billing", query: filter }} className="justify-self-start text-[13.5px] font-semibold text-primary">
          {t("panel.more", { count: localDigits(list.total - list.items.length, locale) })}
        </Link>
      ) : null}
      {unit?.billTo && unit.isActive ? (
        <BillAhead unitId={unit.id} min={thisMonth} max={monthOfDay(addMonths(`${thisMonth}-01`, MAX_BILL_AHEAD_MONTHS))} />
      ) : null}
      {unit && chargeTypes ? (
        unit.hasOpening ? (
          <p className="text-[13px] text-muted-foreground">{t("opening.exists")}</p>
        ) : !unit.billTo ? (
          <Note tone="warn">{t("opening.nobody")}</Note>
        ) : unit.isActive ? (
          <OpeningForm unitId={unit.id} chargeTypes={chargeTypes} today={dhakaDay()} />
        ) : null
      ) : null}
    </Card>
  );
}
