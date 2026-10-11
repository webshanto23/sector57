import { formatDate, formatTaka, localDigits, pick, type Locale, type PreviewLine } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, Chip, DataTable, inputClass, PageHeader, type Column } from "@/components/kit";
import { ConfirmRun } from "@/components/recurring/confirm-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getRunPreview } from "@/lib/api/recurring";
import { requirePermission } from "@/lib/api/session";
import { dhakaDay } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/recurring/run">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Recurring.run" });
  return { title: t("title") };
}

/** The billing run preview: what would be billed up to a month, at what rate, and who is left out. Confirming makes the bills. */
export default async function RunPage({ params, searchParams }: PageProps<"/[locale]/dashboard/recurring/run">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("billing", "create");
  const thisMonth = dhakaDay().slice(0, 7);
  const { month: asked } = await searchParams;
  const month = typeof asked === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const [t, tSkip, preview] = await Promise.all([
    getTranslations("Recurring.run"),
    getTranslations("Recurring.skip"),
    getRunPreview(month),
  ]);
  const scheduleName = new Map((preview?.schedules ?? []).map((s) => [s.id, pick(s.nameBn, s.nameEn, locale)]));
  const monthOf = (day: string) => formatDate(day, locale, "monthYear");
  const period = (line: PreviewLine) => (monthOf(line.periodStart) === monthOf(line.periodEnd) ? monthOf(line.periodStart) : `${monthOf(line.periodStart)} – ${monthOf(line.periodEnd)}`);

  const columns: Column<PreviewLine>[] = [
    {
      key: "unit",
      header: t("unit"),
      cell: (line) => (
        <span className="grid">
          <span className="font-semibold">{line.unitName}</span>
          <span className="text-[12px] whitespace-normal text-muted-foreground">{line.address.join(", ")}</span>
        </span>
      ),
    },
    { key: "billTo", header: t("billTo"), cell: (line) => line.billTo },
    { key: "charge", header: t("charge"), cell: (line) => scheduleName.get(line.scheduleId) ?? "" },
    { key: "period", header: t("period"), cell: period },
    { key: "rate", header: t("rate"), cell: (line) => (line.rateFrom ? t("rateFrom", { place: line.rateFrom }) : t("rateDefault")) },
    { key: "amount", header: t("amount"), numeric: true, cell: (line) => formatTaka(line.amount, locale) },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <Link href="/dashboard/recurring" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid max-w-[1100px] gap-3.5">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <label className="grid gap-1 text-[13px] font-medium">
            {t("month")}
            <input type="month" name="month" defaultValue={month} max={thisMonth} className={`${inputClass} w-auto`} />
          </label>
          <Button type="submit" variant="outline">
            {t("show")}
          </Button>
        </form>

        {!preview || (preview.lineCount === 0 && preview.schedules.length === 0) ? (
          <Note>{t("nothing")}</Note>
        ) : (
          <>
            <Card className="grid gap-3">
              <p className="text-[15px] font-semibold">
                {t("summary", {
                  invoices: localDigits(preview.invoiceCount, locale),
                  lines: localDigits(preview.lineCount, locale),
                  total: formatTaka(preview.total, locale),
                })}
              </p>
              <ul className="grid gap-1.5 text-[13.5px]">
                {preview.schedules.map((schedule) => (
                  <li key={schedule.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pick(schedule.nameBn, schedule.nameEn, locale)}</span>
                    <span className="text-muted-foreground">
                      {schedule.periods.map(monthOf).join(", ")} · {localDigits(schedule.lines, locale)} · {formatTaka(schedule.total, locale)}
                    </span>
                    {schedule.blocked ? <Chip tone="warn">{t(`blocked.${schedule.blocked}`)}</Chip> : null}
                  </li>
                ))}
              </ul>
              {preview.invoiceCount > 0 ? <ConfirmRun month={month} invoices={preview.invoiceCount} total={preview.total} /> : null}
            </Card>

            {preview.lines.length ? (
              <Card className="grid gap-3">
                <h2 className="text-[15px]">{t("lines")}</h2>
                {preview.lineCount > preview.lines.length ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    {t("linesMore", { shown: localDigits(preview.lines.length, locale), total: localDigits(preview.lineCount, locale) })}
                  </p>
                ) : null}
                <DataTable
                  columns={columns}
                  rows={preview.lines}
                  rowKey={(line) => `${line.unitId}-${line.scheduleId}-${line.periodStart}`}
                  caption={t("lines")}
                />
              </Card>
            ) : null}

            {preview.skipped.length ? (
              <Card className="grid gap-3">
                <h2 className="text-[15px]">{t("skipped")}</h2>
                <p className="text-[13px] text-muted-foreground">
                  {t("skippedCounts", {
                    no_bill_to: localDigits(preview.skippedCounts.no_bill_to, locale),
                    inactive: localDigits(preview.skippedCounts.inactive, locale),
                    already_billed: localDigits(preview.skippedCounts.already_billed, locale),
                  })}
                </p>
                <ul className="grid gap-1 text-[13.5px]">
                  {preview.skipped.map((skip) => (
                    <li key={`${skip.unitId}-${skip.scheduleId}`}>
                      <span className="font-medium">{skip.name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {[...skip.address].join(", ")} · {scheduleName.get(skip.scheduleId) ?? ""} · {tSkip(skip.reason)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
