import { formatDate, pick, type Locale } from "@s57/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, Chip, PageHeader } from "@/components/kit";
import { PAYROLL_STATUS_TONES } from "@/components/payroll/payroll-status";
import { PayslipBody } from "@/components/payroll/payslip-body";
import { PayslipEditor } from "@/components/payroll/payslip-editor";
import { PayslipPrint } from "@/components/payroll/payslip-print";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPayrollMonth, getPayslipSheet } from "@/lib/api/payroll";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm/payroll/[id]/[payslipId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Payroll.payslip" });
  return { title: t("title") };
}

/** One payslip: its figures, the editor while the run is a draft, and the A5 print. */
export default async function PayslipPage({ params }: PageProps<"/[locale]/dashboard/hrm/payroll/[id]/[payslipId]">) {
  const { locale: raw, id, payslipId } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("payroll");
  const sheet = await getPayslipSheet(id, payslipId);
  if (!sheet) notFound();
  const [t, tStatus, view] = await Promise.all([getTranslations("Payroll.payslip"), getTranslations("Payroll.status"), getPayrollMonth(sheet.month)]);
  // Only the month's live run can be edited; a voided one is read-only.
  const run = view.run?.id === id ? view.run : null;
  const { payslip } = sheet;
  const name = pick(payslip.staff.name, payslip.staff.nameEn, locale);

  return (
    <>
      <Link href={`/dashboard/hrm/payroll?month=${sheet.month}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} mb-2`}>
        <ArrowLeft aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={t("titleOf", { name })}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDate(`${sheet.month}-01`, locale, "monthYear")}
            <Chip tone={PAYROLL_STATUS_TONES[sheet.status]}>{tStatus(sheet.status)}</Chip>
          </span>
        }
        actions={<PayslipPrint sheet={sheet} />}
      />
      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card className="grid content-start gap-3">
          {payslip.rate === "0.00" ? <Note tone="warn">{t("noPay")}</Note> : null}
          <PayslipBody sheet={sheet} locale={locale} />
        </Card>
        {run?.can.edit ? <PayslipEditor runId={run.id} payslip={payslip} funds={view.funds} /> : null}
      </div>
    </>
  );
}
