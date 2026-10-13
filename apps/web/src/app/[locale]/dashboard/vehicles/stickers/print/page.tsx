import { formatNumber, stickerSheetQuery, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { StickerSheetPrint } from "@/components/vehicles/sticker-sheet";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/api/session";
import { getStickerSheet } from "@/lib/api/vehicles";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/vehicles/stickers/print">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Vehicles" });
  return { title: t("printTitle") };
}

/** The stickers in force among `?ids=` (ticked on the list or one vehicle's) to print on A4. */
export default async function StickerPrintPage({ params, searchParams }: PageProps<"/[locale]/dashboard/vehicles/stickers/print">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("vehicles");
  const ids = (await searchParams)["ids"];
  const parsed = stickerSheetQuery.safeParse({ ids: typeof ids === "string" ? ids : "" });
  const [t, sheet] = await Promise.all([getTranslations("Vehicles"), parsed.success ? getStickerSheet(parsed.data.ids) : Promise.resolve(null)]);
  const asked = parsed.success ? parsed.data.ids.length : 0;

  return (
    <>
      <PageHeader
        title={t("printTitle")}
        sub={sheet ? t("printCount", { count: formatNumber(sheet.items.length, locale) }) : undefined}
        actions={
          <Link href="/dashboard/vehicles/stickers" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("backToStickers")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!sheet || sheet.items.length === 0 ? (
          <Note tone="warn">{t("printNone")}</Note>
        ) : (
          <>
            {sheet.items.length < asked ? <Note tone="warn">{t("printSkipped", { count: formatNumber(asked - sheet.items.length, locale) })}</Note> : null}
            <StickerSheetPrint sheet={sheet} />
          </>
        )}
      </div>
    </>
  );
}
