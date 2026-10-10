import {
  canAnywhere,
  developmentsContentSchema,
  EDITABLE_PAGES,
  homeContentSchema,
  siteInfoSchema,
  type EditablePage,
  type Locale,
} from "@s57/shared";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DevelopmentsEditor } from "@/components/cms/pages/developments-editor";
import { HomeEditor } from "@/components/cms/pages/home-editor";
import { SiteInfoEditor } from "@/components/cms/pages/site-info-editor";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSitePageAdmin } from "@/lib/api/cms";
import { requirePermission } from "@/lib/api/session";

const isEditable = (slug: string): slug is EditablePage => (EDITABLE_PAGES as readonly string[]).includes(slug);

/** Where each page appears on the public site. */
const PUBLIC_PATHS: Record<EditablePage, string> = { home: "/", site: "/", developments: "/developments" };

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/website/pages/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isEditable(slug)) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: "Cms.pages" });
  return { title: t(`${slug}.title`) };
}

/** One page editor. Stored content that no longer matches its schema opens empty, with a warning. */
export default async function EditPagePage({ params }: PageProps<"/[locale]/dashboard/website/pages/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  if (!isEditable(slug)) notFound();

  const me = await requirePermission("site");
  const [t, page] = await Promise.all([getTranslations("Cms.pages"), getSitePageAdmin(slug)]);
  const canSave = canAnywhere(me.access, "site", "edit");

  const schema = { home: homeContentSchema, site: siteInfoSchema, developments: developmentsContentSchema }[slug];
  const parsed = page.content ? schema.safeParse(page.content) : null;
  const invalid = parsed !== null && !parsed.success;

  return (
    <>
      <PageHeader
        title={t(`${slug}.title`)}
        sub={t(`${slug}.sub`)}
        actions={
          <>
            <Link href={PUBLIC_PATHS[slug]} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink aria-hidden />
              {t("viewOnSite")}
            </Link>
            <Link href="/dashboard/website" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("backToPages")}
            </Link>
          </>
        }
      />
      <div className="grid gap-3.5">
        {invalid ? <Note tone="warn">{t("invalidContent")}</Note> : null}
        {!canSave ? <Note>{t("readOnly")}</Note> : null}
        {slug === "home" ? (
          <HomeEditor initial={parsed?.success ? homeContentSchema.parse(page.content) : null} canSave={canSave} />
        ) : slug === "site" ? (
          <SiteInfoEditor initial={parsed?.success ? siteInfoSchema.parse(page.content) : null} canSave={canSave} />
        ) : (
          <DevelopmentsEditor initial={parsed?.success ? developmentsContentSchema.parse(page.content) : null} canSave={canSave} />
        )}
      </div>
    </>
  );
}
