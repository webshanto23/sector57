import { localDigits, pick, type Locale } from "@s57/shared";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageHeader } from "@/components/kit";
import { Art, sceneFor } from "@/components/site/art";
import { FallbackImage } from "@/components/site/fallback-image";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAlbums } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Gallery" });
  return { title: t("title"), description: t("sub"), alternates: alternates("/gallery", locale as Locale) };
}

/** Photo gallery (mockup `PUB.gallery`): one card per published album. */
export default async function GalleryPage({ params, searchParams }: PageProps<"/[locale]/gallery">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const pageParam = Number((await searchParams)["page"]);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const [t, common, albums] = await Promise.all([
    getTranslations("Gallery"),
    getTranslations("Common"),
    getAlbums(page, PAGE_SIZE),
  ]);
  const pages = Math.max(1, Math.ceil(albums.total / PAGE_SIZE));
  const pageLabel = common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) });

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      {albums.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[600px]:max-[1099px]:[&>:last-child:nth-child(odd)]:col-span-full">
          {albums.items.map((album) => {
            const title = pick(album.titleBn, album.titleEn, locale);
            const placeholder = sceneFor(album.id);
            const art = <Art scene={placeholder.scene} seed={placeholder.seed} ratio={[4, 3]} className="rounded-[8px]" />;
            return (
              <li key={album.id}>
                <Link href={`/gallery/${album.id}`} className="block h-full text-fg no-underline">
                  <Card className="grid h-full content-start gap-2.5 p-2.5 transition-colors hover:border-muted-foreground min-[600px]:p-2.5">
                    {album.coverUrl ? (
                      <FallbackImage
                        src={album.coverUrl}
                        alt=""
                        width={640}
                        height={480}
                        unoptimized
                        className="aspect-[4/3] w-full rounded-[8px] object-cover"
                        fallback={art}
                      />
                    ) : (
                      art
                    )}
                    <div className="flex items-center justify-between gap-2 px-1 pb-1">
                      <h4>{title}</h4>
                      <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
                        <ImageIcon className="size-[15px]" aria-hidden />
                        {t("photoCount", { count: localDigits(album.photoCount, locale) })}
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label={pageLabel} className="mt-5 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={{ pathname: "/gallery", query: page > 2 ? { page: String(page - 1) } : {} }}
              className={buttonVariants({ variant: "outline" })}
              rel="prev"
            >
              <ChevronLeft aria-hidden />
              {common("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">{pageLabel}</span>
          {page < pages ? (
            <Link
              href={{ pathname: "/gallery", query: { page: String(page + 1) } }}
              className={buttonVariants({ variant: "outline" })}
              rel="next"
            >
              {common("next")}
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
