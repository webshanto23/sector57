import { formatDate, formatNumber, formatTaka, pick, type Locale, type PayslipSheet } from "@s57/shared";
import { useTranslations } from "next-intl";

/** A payslip's details and figures, on screen and on the printed A5 sheet. */
export function PayslipBody({ sheet, locale }: { sheet: PayslipSheet; locale: Locale }) {
  const t = useTranslations("Payroll.payslip");
  const tTable = useTranslations("Payroll.table");
  const { payslip } = sheet;
  const n = (value: number) => formatNumber(value, locale);
  const taka = (amount: string) => formatTaka(amount, locale);
  const details: [string, string][] = [
    [t("staffNo"), n(payslip.staff.staffNo)],
    [t("designation"), pick(payslip.staff.designationBn, payslip.staff.designationEn, locale)],
    [t("month"), formatDate(`${sheet.month}-01`, locale, "monthYear")],
    [t("period"), `${formatDate(sheet.period.from, locale)} – ${formatDate(sheet.period.to, locale)}`],
    [t(payslip.kind === "daily" ? "rate.daily" : "rate.monthly"), taka(payslip.rate)],
    [t("attendance"), tTable("daysValue", { present: n(payslip.presentDays), half: n(payslip.halfDays), absent: n(payslip.absentDays) })],
    [t("fund"), pick(payslip.fund.nameBn, payslip.fund.nameEn, locale)],
  ];
  const figures: { key: string; label: string; amount: string; sign: "" | "+" | "−" }[] = [
    { key: "base", label: t("base"), amount: payslip.base, sign: "" },
    { key: "absence", label: t("attendanceDeduction"), amount: payslip.attendanceDeduction, sign: "−" },
    ...payslip.lines.map((line) => ({
      key: line.id,
      label: pick(line.labelBn, line.labelEn, locale),
      amount: line.amount,
      sign: line.kind === "allowance" ? ("+" as const) : ("−" as const),
    })),
  ];

  return (
    <div className="grid gap-3 text-[13.5px]">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-1 border-t border-dashed border-line pt-2">
        {figures.map((row) => (
          <div key={row.key} className="flex justify-between gap-3">
            <span className="min-w-0">{row.label}</span>
            <span className="num whitespace-nowrap">
              {row.sign ? `${row.sign} ` : ""}
              {taka(row.amount)}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
          <span>{t("net")}</span>
          <span className="num text-base whitespace-nowrap">{taka(payslip.net)}</span>
        </div>
      </div>
      {payslip.note ? (
        <p>
          <span className="text-muted-foreground">{t("note")}: </span>
          {payslip.note}
        </p>
      ) : null}
    </div>
  );
}
