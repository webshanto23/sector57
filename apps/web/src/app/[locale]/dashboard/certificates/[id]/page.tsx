import { canAnywhere, formatDate, formatTaka, isZeroMoney, pick, type CertificateDetail, type Locale } from "@s57/shared";
import { ChevronLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { DeleteDraftCard, DraftEditor } from "@/components/certificates/certificate-forms";
import { IssueCard, VoidCard } from "@/components/certificates/certificate-issue";
import { CertificateStatusChip } from "@/components/certificates/certificates-table";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCertificate } from "@/lib/api/certificates";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/certificates/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("certificates");
  const [t, certificate] = await Promise.all([getTranslations({ locale: locale as Locale, namespace: "Certificates" }), getCertificate(id)]);
  return certificate ? { title: certificate.certNo ?? t(`type.${certificate.type}`) } : {};
}

/** One certificate: its details (editable while a draft), the letter, and issuing, voiding or printing it. */
export default async function CertificatePage({ params }: PageProps<"/[locale]/dashboard/certificates/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("certificates");
  const [t, certificate] = await Promise.all([getTranslations("Certificates"), getCertificate(id)]);
  if (!certificate) notFound();
  const unit = { id: certificate.place.id, name: [...certificate.place.address, certificate.place.name].join(", ") };
  const draft = certificate.status === "draft";
  const owedAtIssue = certificate.duesOwedAtIssue && !isZeroMoney(certificate.duesOwedAtIssue) ? certificate.duesOwedAtIssue : null;

  return (
    <>
      <PageHeader
        title={<span className="num">{certificate.certNo ?? t("draftNo")}</span>}
        sub={t(`type.${certificate.type}`)}
        actions={
          <>
            {!draft ? (
              <Link href={`/dashboard/certificates/${certificate.id}/print`} className={buttonVariants()}>
                <Printer aria-hidden />
                {t("print")}
              </Link>
            ) : null}
            <Link href="/dashboard/certificates" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("back")}
            </Link>
          </>
        }
      />
      <div className="grid gap-3.5">
        {certificate.status === "void" ? (
          <Note tone="warn">{t("voidedNote", { date: formatDate(certificate.voidedAt!, locale, "short"), reason: certificate.voidReason ?? "" })}</Note>
        ) : null}
        {owedAtIssue ? <Note tone="warn">{t("duesAtIssue", { amount: formatTaka(owedAtIssue, locale) })}</Note> : null}
        {draft && !certificate.can.edit && !certificate.can.issue ? <Note>{t("readOnly")}</Note> : null}

        <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-3.5">
            {draft && certificate.can.edit ? (
              <DraftEditor key={certificate.id} certificate={certificate} unit={unit} />
            ) : (
              <Summary certificate={certificate} unit={unit.name} locale={locale} personLink={canAnywhere(me.access, "members")} t={t} />
            )}
            <Card className="grid content-start gap-2">
              <h2 className="text-[15px]">{t("letterTitle")}</h2>
              {draft ? <p className="text-[13px] text-muted-foreground">{t("letterDraftHint")}</p> : null}
              <p lang={certificate.lang} className="text-[14px] leading-relaxed whitespace-pre-line">
                {certificate.body}
              </p>
            </Card>
          </div>
          <div className="grid content-start gap-3.5">
            {certificate.can.issue ? <IssueCard certificate={certificate} signer={me.name ?? me.phone} /> : null}
            {certificate.can.delete ? <DeleteDraftCard certificate={certificate} /> : null}
            {certificate.can.void ? <VoidCard certificate={certificate} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** The certificate as text: for issued and void ones, and for drafts the user may not edit. */
function Summary({
  certificate,
  unit,
  locale,
  personLink,
  t,
}: {
  certificate: CertificateDetail;
  unit: string;
  locale: Locale;
  personLink: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"Certificates">>>;
}) {
  const name = pick(certificate.person.name, certificate.person.nameEn, locale);
  const rows: [string, ReactNode][] = [
    [t("col.status"), <CertificateStatusChip key="status" status={certificate.status} />],
    [t("col.unit"), unit],
    [t("person"), personLink ? <Link href={`/dashboard/members/${certificate.person.id}`}>{name}</Link> : name],
    [t("langLabel"), t(`lang.${certificate.lang}`)],
    [t("purpose"), certificate.purpose ?? "—"],
    [t("addressee"), certificate.addressee ?? "—"],
  ];
  if (certificate.issuedAt) {
    rows.push([t("issuedOn"), `${formatDate(certificate.issuedAt, locale, "short")} · ${certificate.issuedBy?.name ?? ""}`]);
    rows.push([t("signerName"), [certificate.signerName, certificate.signerTitle].filter(Boolean).join(", ")]);
  }
  return (
    <Card className="grid content-start gap-2">
      <h2 className="text-[15px]">{t("details")}</h2>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] min-[600px]:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
