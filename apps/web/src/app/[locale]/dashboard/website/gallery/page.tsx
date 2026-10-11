import { canAnywhere, formatDate, localDigits, pagination, pick, type Locale } from "@s57/shared";
import { ExternalLink, ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewAlbum } from "@/components/cms/gallery/new-album";
import { Pager } from "@/components/cms/pager";
import { PublishedChip } from "@/components/cms/status-chips";
import { Card, Grid, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAlbumsAdmin } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/website/gallery">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Cms.tabs" });
  return { title: t("gallery") };
}

/** Every album, drafts included. */
export default async function GalleryAdminPage({ params, searchParams }: PageProps<"/[locale]/dashboard/website/gallery">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("gallery");
  const parsed = pagination.safeParse({ page: (await searchParams)["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, list] = await Promise.all([getTranslations("Cms.gallery"), getAlbumsAdmin(query)]);

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <Link href="/gallery" target="_blank" className={buttonVariants({ variant: "outline" })}>
            <ExternalLink aria-hidden />
            {t("viewOnSite")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {canAnywhere(me.access, "gallery", "create") ? <NewAlbum /> : null}
        {list.items.length === 0 ? (
          <Card className="text-muted-foreground">{t("empty")}</Card>
        ) : (
          <Grid cols={4}>
            {list.items.map((album) => (
              <Link key={album.id} href={`/dashboard/website/gallery/${album.id}`} className="group rounded-[12px]">
                <Card className="grid h-full content-start gap-2.5 p-2.5 transition-colors group-hover:border-primary min-[600px]:p-2.5">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-surface-2">
                    {album.coverUrl ? (
                      <Image src={album.coverUrl} alt="" fill unoptimized sizes="320px" className="object-cover" />
                    ) : (
                      <span className="grid h-full place-items-center text-muted-foreground">
                        <ImageIcon className="size-6" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1 px-1">
                    <h2 className="text-[14.5px]">{pick(album.titleBn, album.titleEn, locale)}</h2>
                    <p className="text-[12.5px] text-muted-foreground">
                      {album.eventDate ? `${formatDate(album.eventDate, locale, "short")} · ` : ""}
                      {t("photoCount", { count: localDigits(album.photoCount, locale) })}
                    </p>
                    <span>
                      <PublishedChip published={album.isPublished} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </Grid>
        )}
      </div>
      <Pager
        locale={locale}
        page={query.page}
        pages={Math.max(1, Math.ceil(list.total / PAGE_SIZE))}
        href={(target) => ({ pathname: "/dashboard/website/gallery", query: target > 1 ? { page: String(target) } : {} })}
      />
    </>
  );
}
