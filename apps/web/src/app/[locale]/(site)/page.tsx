import { formatDate, HERO_SLIDES_MAX, localDigits, pick, pickContent, type Locale } from "@s57/shared";
import {
  CalendarDays,
  ChevronRight,
  FilePen,
  Flame,
  HardHat,
  Landmark,
  Megaphone,
  Phone,
  ShieldCheck,
  Siren,
  Stethoscope,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Chip, IconTitle, Kantha, ProgressBar } from "@/components/kit";
import { Art } from "@/components/site/art";
import { HeroSlider } from "@/components/site/hero-slider";
import { NOTICE_CATEGORY_STYLE } from "@/components/site/notice-category";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDevelopments, getHeroAlbum, getHomeContent, getLatestNotices } from "@/lib/api/public";
import { getBrand } from "@/lib/brand";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

const CONTACT_ICON = {
  siren: Siren,
  landmark: Landmark,
  "shield-check": ShieldCheck,
  stethoscope: Stethoscope,
  flame: Flame,
  phone: Phone,
} as const;

const linkClass = "inline-flex items-center gap-1 text-[13.5px] font-semibold no-underline";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates("/", locale as Locale) };
}

/** Public home page (mockup `PUB.home`). */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, tn, common, brand, content, notices, developments] = await Promise.all([
    getTranslations("Site.home"),
    getTranslations("Notices"),
    getTranslations("Common"),
    getBrand(locale),
    getHomeContent(),
    getLatestNotices(3),
    getDevelopments(),
  ]);
  const home = content ? pickContent(content, locale) : null;
  const heroAlbum = content?.heroAlbumId ? await getHeroAlbum(content.heroAlbumId) : null;
  const albumTitle = heroAlbum ? pick(heroAlbum.titleBn, heroAlbum.titleEn, locale) : "";
  const slides = (heroAlbum?.photos ?? [])
    .flatMap((photo) => (photo.url ? [{ ...photo, url: photo.url }] : []))
    .slice(0, HERO_SLIDES_MAX)
    .map((photo, index) => ({
      url: photo.url,
      alt: photo.captionBn
        ? pick(photo.captionBn, photo.captionEn, locale)
        : t("slideAlt", { album: albumTitle, n: localDigits(index + 1, locale) }),
    }));
  const art = <Art scene="lake" seed={7} ratio={[4, 3]} label={t("artLabel")} className="h-full" />;
  // Same projects as the developments page: ongoing first, at most three.
  const projects = (developments?.projects ?? [])
    .filter((project) => project.status !== "completed")
    .slice(0, 3)
    .map((project) => ({
      title: pick(project.titleBn, project.titleEn, locale),
      progress: project.progress,
    }));

  return (
    <div className="grid gap-3.5">
      <section className="grid overflow-hidden rounded-[12px] border border-line bg-surface min-[761px]:grid-cols-[1.15fr_1fr]">
        <div className="grid content-center gap-3.5 p-5 min-[761px]:px-7 min-[761px]:pt-7 min-[761px]:pb-6">
          <span className="text-[12.5px] font-semibold tracking-[.02em] text-primary">
            {home?.hero.label ?? brand.name}
          </span>
          <h1 className="font-display text-[clamp(25px,3.4vw,34px)] leading-[1.35]">
            {home?.hero.title ?? brand.name}
          </h1>
          <p className="text-muted-foreground">{home?.hero.lead ?? common("siteDescription", { name: brand.name })}</p>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/forms" className={buttonVariants()}>
              <FilePen aria-hidden />
              {t("register")}
            </Link>
            <Link href="/notices" className={buttonVariants({ variant: "outline" })}>
              <Megaphone aria-hidden />
              {t("latestNotices")}
            </Link>
          </div>
          {home && home.stats.length > 0 ? (
            <>
              <Kantha className="mt-1" />
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                {home.stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                    <dd className="font-display text-[22px] font-bold text-primary">
                      {localDigits(stat.value, locale)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
        {/* Photo frame inset in the card: no padding on the text side (left on desktop, top on phones). */}
        <div className="px-2.5 pb-2.5 min-[761px]:py-2.5 min-[761px]:pl-0">
          <div className="h-full overflow-hidden rounded-[8px] bg-[var(--accent-brand-soft)]">
            {slides.length > 0 ? <HeroSlider slides={slides} fallback={art} /> : art}
          </div>
        </div>
      </section>

      <div className="mt-0.5 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-3.5">
        <Card className="grid content-start gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <IconTitle icon={Megaphone}>{t("noticeBoard")}</IconTitle>
            <Link href="/notices" className={linkClass}>
              {t("allNotices")}
              <ChevronRight className="size-[15px]" aria-hidden />
            </Link>
          </div>
          {notices.length === 0 ? <p className="text-muted-foreground">{common("empty")}</p> : null}
          {notices.map((notice) => (
            <div key={notice.id} className="flex items-start justify-between gap-3 border-t border-line pt-2.5">
              <div className="min-w-0">
                <h4>
                  <Link href={`/notices/${notice.id}`} className="text-fg no-underline hover:underline">
                    {pick(notice.titleBn, notice.titleEn, locale)}
                  </Link>
                </h4>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {pick(notice.bodyBn, notice.bodyEn, locale)}
                </p>
              </div>
              <div className="grid justify-items-end gap-1">
                <Chip tone={NOTICE_CATEGORY_STYLE[notice.category].tone}>{tn(`category.${notice.category}`)}</Chip>
                <time dateTime={notice.publishAt} className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(notice.publishAt, locale)}
                </time>
              </div>
            </div>
          ))}
        </Card>

        <Card className="grid content-start gap-2.5">
          <IconTitle icon={CalendarDays} tone="sun">
            {t("events")}
          </IconTitle>
          {!home || home.events.length === 0 ? <p className="text-muted-foreground">{t("noEvents")}</p> : null}
          {home?.events.map((event) => (
            <div key={`${event.date}-${event.title}`} className="flex items-center gap-2.5">
              <time
                dateTime={event.date}
                className="min-w-[58px] rounded-[10px] bg-[var(--accent-brand-soft)] px-2 py-1.5 text-center leading-[1.2] text-primary"
              >
                <b className="block text-[19px]">{formatDate(event.date, locale, "day")}</b>
                <span className="text-xs">{formatDate(event.date, locale, "month")}</span>
              </time>
              <div>
                <h4>{event.title}</h4>
                <p className="text-xs text-muted-foreground">{event.place}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {home || projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-3.5 min-[701px]:grid-cols-2">
          {projects.length > 0 ? (
            <Card className="grid content-start gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <IconTitle icon={HardHat} tone="warn">
                  {t("developments")}
                </IconTitle>
                <Link href="/developments" className={linkClass}>
                  {t("allProjects")}
                  <ChevronRight className="size-[15px]" aria-hidden />
                </Link>
              </div>
              {projects.map((item) => (
                <div key={item.title} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4>{item.title}</h4>
                    <span className="text-xs text-muted-foreground">{localDigits(`${item.progress}%`, locale)}</span>
                  </div>
                  <ProgressBar
                    value={item.progress}
                    label={t("progress", {
                      title: item.title,
                      percent: localDigits(item.progress, locale),
                    })}
                  />
                </div>
              ))}
            </Card>
          ) : null}

          {home ? (
            <Card className="grid content-start gap-2.5">
              <IconTitle icon={Siren} tone="sun">
                {t("emergency")}
              </IconTitle>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2">
                {home.emergency.map((contact) => {
                  const Icon = CONTACT_ICON[contact.icon];
                  return (
                    <Card key={contact.label} flat className="flex items-center gap-2 p-2.5 min-[600px]:p-2.5">
                      <Icon className="size-[18px] flex-none text-sun" aria-hidden />
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{contact.label}</div>
                        <a
                          href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                          className="font-bold text-fg no-underline"
                        >
                          {localDigits(contact.phone, locale)}
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
