import { canAnywhere, pick, type Locale } from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlbumForm } from "@/components/cms/gallery/album-form";
import { PhotoManager } from "@/components/cms/gallery/photo-manager";
import { PublishedChip } from "@/components/cms/status-chips";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAlbumAdmin } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/website/gallery/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("gallery");
  const album = await getAlbumAdmin(id);
  return album ? { title: pick(album.titleBn, album.titleEn, locale as Locale) } : {};
}

/** One album: its details and its photos. */
export default async function AlbumAdminPage({ params }: PageProps<"/[locale]/dashboard/website/gallery/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("gallery");
  const [t, album] = await Promise.all([getTranslations("Cms.gallery"), getAlbumAdmin(id)]);
  if (!album) notFound();
  const can = {
    create: canAnywhere(me.access, "gallery", "create"),
    edit: canAnywhere(me.access, "gallery", "edit"),
    delete: canAnywhere(me.access, "gallery", "delete"),
  };

  return (
    <>
      <PageHeader
        title={pick(album.titleBn, album.titleEn, locale)}
        sub={<PublishedChip published={album.isPublished} />}
        actions={
          <>
            {album.isPublished ? (
              <Link href={`/gallery/${album.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
                <ExternalLink aria-hidden />
                {t("viewOnSite")}
              </Link>
            ) : null}
            <Link href="/dashboard/website/gallery" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("backToList")}
            </Link>
          </>
        }
      />
      <div className="grid gap-3.5">
        <Card className="grid gap-3.5">
          <h2 className="text-[15px]">{t("details")}</h2>
          <AlbumForm key={album.id} album={album} canSave={can.edit} canDelete={can.delete} />
        </Card>
        <PhotoManager album={album} can={can} />
      </div>
    </>
  );
}
