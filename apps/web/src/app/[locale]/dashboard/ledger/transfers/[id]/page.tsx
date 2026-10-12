import { formatDate, formatTaka, pick, type Locale, type Transfer } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, Chip, PageHeader } from "@/components/kit";
import { TransferVoidPanel } from "@/components/ledger/transfer-void-panel";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getTransfer } from "@/lib/api/reports";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/ledger/transfers/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("ledger");
  const [transfer, t] = await Promise.all([getTransfer(id), getTranslations({ locale: locale as Locale, namespace: "Ledger.transfers" })]);
  return transfer ? { title: t(`kind.${transfer.kind}`) } : {};
}

/** One transfer: both sides, who entered it, and voiding for `ledger.approve`. */
export default async function TransferPage({ params }: PageProps<"/[locale]/dashboard/ledger/transfers/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("ledger");
  const [t, tList, tFunds, transfer] = await Promise.all([
    getTranslations("Ledger.detail"),
    getTranslations("Ledger.transfers"),
    getTranslations("Finance.funds"),
    getTransfer(id),
  ]);
  if (!transfer) notFound();
  const side = (s: Transfer["from"]) => `${pick(s.fund.nameBn, s.fund.nameEn, locale)} · ${tFunds(s.account)}`;
  const rows: [string, string][] = [
    [t("date"), formatDate(transfer.date, locale)],
    [t("from"), side(transfer.from)],
    [t("to"), side(transfer.to)],
    [t("memo"), transfer.memo ?? "—"],
    [t("by"), `${transfer.created.by ?? t("someone")}, ${formatDate(transfer.created.at, locale, "stamp")}`],
  ];

  return (
    <>
      <PageHeader
        title={tList(`kind.${transfer.kind}`)}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="num font-semibold text-fg">{formatTaka(transfer.amount, locale)}</span>
            {transfer.void ? <Chip>{tList("void")}</Chip> : <Chip tone="good">{tList("done")}</Chip>}
          </span>
        }
        actions={
          <Link href="/dashboard/ledger/transfers" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tList("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_340px] min-[900px]:items-start">
        <div className="grid gap-3.5">
          {transfer.void ? (
            <Note tone="warn">
              {t("voided", { by: transfer.void.by ?? t("someone"), date: formatDate(transfer.void.at, locale, "stamp"), reason: transfer.void.reason })}
            </Note>
          ) : null}
          <Card className="grid gap-3 text-[13.5px]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Link
              href={{ pathname: "/dashboard/ledger", query: { fundId: transfer.from.fund.id, from: transfer.date, to: transfer.date } }}
              className="font-semibold text-primary"
            >
              {t("statement")}
            </Link>
          </Card>
        </div>
        {transfer.can.void ? <TransferVoidPanel id={transfer.id} /> : null}
      </div>
    </>
  );
}
