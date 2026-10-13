import { formatDate, formatTaka, isAssetGone, localDigits, pick, type AssetDetail, type Locale } from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { AssetEditor, PhotoCard, StatusCard } from "@/components/facilities/asset-forms";
import { AssetHistory } from "@/components/facilities/asset-history";
import { AssetStatusChip } from "@/components/facilities/asset-status";
import { PlansCard } from "@/components/facilities/plans-card";
import { Card, Chip, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAsset, getAssetOptions } from "@/lib/api/facilities";
import { todayInDhaka } from "@/lib/dhaka-time";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/facilities/assets/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("facilities");
  const asset = await getAsset(id);
  return asset ? { title: `${asset.assetNo} ${asset.name.bn}` } : {};
}

/** One asset: details, where it is and who keeps it, status, photo, upkeep, history and papers. */
export default async function AssetPage({ params }: PageProps<"/[locale]/dashboard/facilities/assets/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("facilities");
  const today = todayInDhaka();
  const [t, asset] = await Promise.all([getTranslations("Assets"), getAsset(id)]);
  if (!asset) notFound();
  const options = asset.can.edit ? await getAssetOptions() : null;
  const placeLine = [...asset.place.address, asset.place.name].join(", ");

  return (
    <>
      <PageHeader
        title={pick(asset.name.bn, asset.name.en, locale)}
        sub={[asset.assetNo, asset.category].join(" · ")}
        actions={
          <Link href="/dashboard/facilities/assets" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <AssetStatusChip status={asset.status} />
          {asset.facility ? (
            <Link href={`/dashboard/facilities/${asset.facility.id}`}>
              <Chip tone="acc" plain>
                {pick(asset.facility.name.bn, asset.facility.name.en, locale)}
              </Chip>
            </Link>
          ) : null}
          <span>{t("keptAt", { place: placeLine })}</span>
          {asset.custodian ? <span>· {t("keptBy", { name: pick(asset.custodian.name, asset.custodian.nameEn, locale) })}</span> : null}
        </div>

        {isAssetGone(asset.status) ? (
          <Note tone="warn">
            {t("goneNote", { status: t(`status.${asset.status}`), date: asset.retiredOn ? formatDate(asset.retiredOn, locale, "short") : "", reason: asset.retiredReason ?? "" })}
          </Note>
        ) : !asset.can.edit ? (
          <Note>{t("readOnly")}</Note>
        ) : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-3.5">
            {asset.can.edit && options ? <AssetEditor key={asset.id} asset={asset} options={options} /> : <Summary asset={asset} locale={locale} t={t} />}
            <PlansCard asset={asset} today={today} />
          </div>
          <div className="grid content-start gap-3.5">
            {asset.can.statuses.length > 0 ? <StatusCard key={asset.status} asset={asset} today={today} /> : null}
            {asset.can.edit || asset.photoUrl ? <PhotoCard asset={asset} /> : null}
            {asset.expense?.open ? (
              <Link href={`/dashboard/expenses/${asset.expense.id}`} className={`${buttonVariants({ variant: "outline" })} justify-self-start`}>
                <ExternalLink aria-hidden />
                {t("openExpense", { voucher: asset.expense.voucherNo ?? "" })}
              </Link>
            ) : null}
            <AssetHistory events={asset.history} locale={locale} />
            <DocumentsPanel access={me.access} entityType="asset" entityId={asset.id} />
          </div>
        </div>
      </div>
    </>
  );
}

/** The asset as text, for those who may only look (or once it is retired or lost). */
function Summary({ asset, locale, t }: { asset: AssetDetail; locale: Locale; t: Awaited<ReturnType<typeof getTranslations<"Assets">>> }) {
  const rows: [string, string][] = [
    [t("category"), asset.category],
    [t("purchasedOn"), asset.purchasedOn ? formatDate(asset.purchasedOn, locale) : "—"],
    [t("purchaseCost"), asset.purchaseCost ? formatTaka(asset.purchaseCost, locale) : "—"],
    [t("vendor"), asset.vendor?.name ?? "—"],
    [t("voucherNo"), asset.expense ? `${asset.expense.voucherNo ?? ""} (${formatTaka(asset.expense.amount, locale)})` : "—"],
    [t("warrantyUntil"), asset.warrantyUntil ? formatDate(asset.warrantyUntil, locale) : "—"],
    [t("custodian"), asset.custodian ? `${pick(asset.custodian.name, asset.custodian.nameEn, locale)} (${t("staffNo", { no: localDigits(asset.custodian.staffNo, locale) })})` : "—"],
    [t("note"), asset.note ?? "—"],
  ];
  return (
    <Card className="grid gap-2">
      <h2 className="text-[15px]">{t("details")}</h2>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
