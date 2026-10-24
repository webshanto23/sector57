import { CERTIFICATE_TYPES, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PlaceholderList, TemplateCard } from "@/components/certificates/template-editor";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCertificateTemplates } from "@/lib/api/certificates";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/certificates/templates">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Certificates" });
  return { title: t("templates.title") };
}

/** The text each type of certificate issues with, in Bangla and English; changed with `settings.edit`. */
export default async function CertificateTemplatesPage({ params }: PageProps<"/[locale]/dashboard/certificates/templates">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("certificates");
  const [t, view] = await Promise.all([getTranslations("Certificates"), getCertificateTemplates()]);

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        sub={t("templates.sub")}
        actions={
          <Link href="/dashboard/certificates" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!view.can.edit ? <Note>{t("templates.readOnly")}</Note> : null}
        <Card className="grid gap-2.5">
          <h2 className="text-[15px]">{t("templates.placeholdersTitle")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("templates.hint")}</p>
          <PlaceholderList placeholders={view.placeholders} />
        </Card>
        {CERTIFICATE_TYPES.map((type) => (
          <TemplateCard
            key={`${type}-${view.templates[type].bn}-${view.templates[type].en}`}
            type={type}
            saved={view.templates[type]}
            fallback={view.defaults[type]}
            customised={view.customised.includes(type)}
            canEdit={view.can.edit}
          />
        ))}
      </div>
    </>
  );
}
