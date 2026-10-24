import { canAnywhere, localDigits, type Access, type Locale } from "@s57/shared";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCertificates } from "@/lib/api/certificates";
import { CertificatesTable } from "./certificates-table";

const SHOWN = 10;

/** The certificates of a unit or of a person, within the caller's certificates area. A unit page also offers a new one. */
export async function CertificatesPanel({ access, locale, unitId, personId }: { access: Access; locale: Locale; unitId?: string; personId?: string }) {
  if (!canAnywhere(access, "certificates")) return null;
  const [t, list] = await Promise.all([getTranslations("Certificates"), getCertificates({ unitId, personId, pageSize: SHOWN })]);
  const filter = unitId ? { unitId } : { personId: personId! };

  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t("panel.title")}</h2>
        {unitId && list.can.create ? (
          <Link href={{ pathname: "/dashboard/certificates/new", query: { unitId } }} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus aria-hidden />
            {t("add")}
          </Link>
        ) : null}
      </div>
      <CertificatesTable
        rows={list.items}
        locale={locale}
        empty={t("panel.empty")}
        hide={unitId ? ["unit"] : ["person"]}
        personLinks={canAnywhere(access, "members")}
      />
      {list.total > list.items.length ? (
        <Link href={{ pathname: "/dashboard/certificates", query: filter }} className="justify-self-start text-[13.5px] font-semibold text-primary">
          {t("panel.more", { count: localDigits(list.total - list.items.length, locale) })}
        </Link>
      ) : null}
    </Card>
  );
}
