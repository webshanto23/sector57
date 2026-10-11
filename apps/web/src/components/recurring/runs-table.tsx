import { formatDate, formatTaka, localDigits, type BillingRun, type Locale } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Card, Chip, DataTable, type Column } from "@/components/kit";

/** The history of billing runs, newest first. A failed run says why; nothing of it was kept. */
export async function RunsTable({ runs, locale }: { runs: BillingRun[]; locale: Locale }) {
  const t = await getTranslations("Recurring.runs");
  const columns: Column<BillingRun>[] = [
    {
      key: "month",
      header: t("month"),
      cell: (run) => (
        <span className="grid">
          <span className="font-semibold">{formatDate(`${run.month}-01`, locale, "monthYear")}</span>
          <span className="text-[12px] text-muted-foreground">{t(`trigger.${run.trigger}`)}</span>
        </span>
      ),
    },
    { key: "when", header: t("when"), cell: (run) => formatDate(run.startedAt, locale, "stamp") },
    { key: "by", header: t("by"), cell: (run) => run.startedBy ?? t("system") },
    { key: "invoices", header: t("invoices"), numeric: true, cell: (run) => localDigits(run.invoiceCount, locale) },
    { key: "total", header: t("total"), numeric: true, cell: (run) => formatTaka(run.total, locale) },
    { key: "skipped", header: t("skipped"), numeric: true, cell: (run) => localDigits(run.skipped.length, locale) },
    {
      key: "status",
      header: t("status.done"),
      cell: (run) =>
        run.status === "done" ? (
          <Chip tone="good">{t("status.done")}</Chip>
        ) : (
          <span className="grid gap-1">
            <Chip tone="bad">{t("status.failed")}</Chip>
            <span className="text-[12px] whitespace-normal text-muted-foreground">{t("failedNote", { error: run.error ?? "" })}</span>
          </span>
        ),
    },
  ];
  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("title")}</h2>
      <DataTable columns={columns} rows={runs} rowKey={(run) => run.id} caption={t("title")} empty={t("empty")} />
    </Card>
  );
}
