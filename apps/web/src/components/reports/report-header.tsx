import { ChevronLeft, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** A report's title with the way back to all reports, its CSV download (when allowed) and any other actions. */
export async function ReportHeader({ title, sub, csv, actions }: { title: string; sub?: ReactNode; csv?: string | null; actions?: ReactNode }) {
  const t = await getTranslations("Reports");
  const tNav = await getTranslations("Dashboard.nav");
  return (
    <PageHeader
      title={title}
      sub={sub}
      actions={
        <>
          <Link href="/dashboard/reports" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tNav("reports")}
          </Link>
          {actions}
          {csv ? (
            // A plain download through the /api proxy: the browser sends the session cookie.
            <a href={csv} download className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden />
              {t("csv")}
            </a>
          ) : null}
        </>
      }
    />
  );
}
