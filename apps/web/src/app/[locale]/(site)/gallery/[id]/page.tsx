import { formatDate, localDigits, pick, type Locale } from "@s57/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Card, PageHeader } from "@/components/kit";
import { Art, sceneFor } from "@/components/site/art";
import { FallbackImage } from "@/components/site/fallback-image";
import { Link } from "@/i18n/navigation";
import { getAlbum } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

// None are built ahead; each album is rendered on its first visit, then cached.
export function generateStaticParams() {
  return [];
}

// generateMetadata and the page share one API call per request.
const loadAlbum = cache(getAlbum);

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery/[id]">): Promise<Metadata> {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  const album = await loadAlbum(id);
  if (!album) return {};
  return { title: pick(album.titleBn, album.titleEn, locale), alternates: alternates(`/gallery/${id}`, locale) };
}

/** One album: its photos in a grid, illustrations standing in until files are uploaded. */
export default async function AlbumPage({ params }: PageProps<"/[locale]/gallery/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const album = await loadAlbum(id);
  if (!album) notFound();

  const t = await getTranslations("Gallery");
  const title = pick(album.titleBn, album.titleEn, locale);
  const sub = [
    album.eventDate ? formatDate(album.eventDate, locale) : null,
    t("photoCount", { count: localDigits(album.photoCount, locale) }),
  ]
    .filter(Boolean)
    .join(" · ");
  const placeholder = sceneFor(album.id);
  const anyPlaceholder = album.photos.some((photo) => !photo.url);

  return (
    <>
      <Link href="/gallery" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-semibold no-underline">
        <ArrowLeft className="size-[15px]" aria-hidden />
        {t("backToGallery")}
      </Link>
      <PageHeader title={title} sub={sub} />

      {album.photos.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t("noPhotos")}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 min-[701px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {album.photos.map((photo, index) => {
            const caption = photo.captionBn ? pick(photo.captionBn, photo.captionEn, locale) : null;
            const alt = caption ?? t("photo", { album: title, n: localDigits(index + 1, locale) });
            const art = (
              <Art scene={placeholder.scene} seed={placeholder.seed + index} ratio={[4, 3]} label={alt} className="rounded-[10px]" />
            );
            return (
              <li key={photo.id}>
                <figure className="grid gap-1.5">
                  {photo.url ? (
                    <FallbackImage
                      src={photo.url}
                      href={photo.url}
                      alt={alt}
                      width={640}
                      height={480}
                      unoptimized
                      className="aspect-[4/3] w-full rounded-[10px] object-cover"
                      fallback={art}
                    />
                  ) : (
                    art
                  )}
                  {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
                </figure>
              </li>
            );
          })}
        </ul>
      )}
      {anyPlaceholder ? <p className="mt-2.5 text-xs text-muted-foreground">{t("placeholderNote")}</p> : null}
    </>
  );
}
