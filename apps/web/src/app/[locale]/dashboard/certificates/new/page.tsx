import { canAnywhere, CERTIFICATE_TYPES, type CertificateType, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewCertificateForm, type UnitLabel } from "@/components/certificates/certificate-forms";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUnit } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/certificates/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Certificates" });
  return { title: t("newTitle") };
}

/** A new draft at a unit in the user's `certificates.create` area (`?unitId=` from a unit page fixes the unit, `?type=` picks the type). */
export default async function NewCertificatePage({ params, searchParams }: PageProps<"/[locale]/dashboard/certificates/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("certificates", "create");
  const search = await searchParams;
  const requested = search["unitId"];
  const type = (CERTIFICATE_TYPES as readonly string[]).includes(String(search["type"])) ? (search["type"] as CertificateType) : null;
  const [t, found] = await Promise.all([
    getTranslations("Certificates"),
    typeof requested === "string" && canAnywhere(me.access, "units") ? getUnit(requested).catch(() => null) : Promise.resolve(null),
  ]);
  const unit: UnitLabel | null = found ? { id: found.id, name: [...found.breadcrumb.map((crumb) => crumb.name), found.name].join(", ") } : null;

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        sub={t("newHint")}
        actions={
          <Link href={unit ? `/dashboard/units/${unit.id}` : "/dashboard/certificates"} className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <NewCertificateForm unit={unit} type={type} />
    </>
  );
}
