import { House } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("Common");

  return (
    <Card className="mx-auto grid max-w-[560px] justify-items-start gap-3 min-[600px]:p-6">
      <h1 className="text-xl">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/" className={buttonVariants()}>
        <House aria-hidden />
        {t("goHome")}
      </Link>
    </Card>
  );
}
