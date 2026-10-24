import type { Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { CertificateLetter } from "@/components/certificates/certificate-letter";
import { CertificatePrintView } from "@/components/certificates/certificate-print";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCertificatePrint } from "@/lib/api/certificates";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/certificates/[id]/print">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Certificates" });
  return { title: t("printTitle") };
}

/** An issued (or void) certificate on A4, in the letter's own language whatever the dashboard's. */
export default async function CertificatePrintPage({ params }: PageProps<"/[locale]/dashboard/certificates/[id]/print">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("certificates");
  const [t, print] = await Promise.all([getTranslations("Certificates"), getCertificatePrint(id)]);
  const paper = print ? await getTranslations({ locale: print.lang, namespace: "Certificates" }) : null;

  return (
    <>
      <PageHeader
        title={t("printTitle")}
        sub={print ? print.certNo : undefined}
        actions={
          <Link href={`/dashboard/certificates/${id}`} className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("backToCertificate")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!print || !paper ? (
          <Note tone="warn">{t("printNone")}</Note>
        ) : (
          <CertificatePrintView>
            <CertificateLetter
              print={print}
              labels={{
                title: paper(`letter.title.${print.type}`),
                no: paper("letter.no"),
                date: paper("letter.date"),
                to: paper("letter.to"),
                subject: paper("letter.subject"),
                signature: paper("letter.signature"),
                void: paper("letter.void"),
              }}
            />
          </CertificatePrintView>
        )}
      </div>
    </>
  );
}
