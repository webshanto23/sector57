import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Unknown dashboard pages and pages the user may not open look the same. */
export default function DashboardNotFound() {
  const t = useTranslations("Dashboard");

  return (
    <Card className="grid max-w-[560px] justify-items-start gap-3 min-[600px]:p-6">
      <h1 className="text-xl">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/dashboard" className={buttonVariants()}>
        <LayoutDashboard aria-hidden />
        {t("backToOverview")}
      </Link>
    </Card>
  );
}
