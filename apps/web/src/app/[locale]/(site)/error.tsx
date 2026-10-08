"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/kit";
import { Button } from "@/components/ui/button";

// Shown when a public page cannot load its data (for example the API is down).
export default function SiteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Common");

  return (
    <Card className="mx-auto grid max-w-[560px] justify-items-start gap-3 min-[600px]:p-6">
      <p>{t("error")}</p>
      <Button variant="outline" onClick={() => retry()}>
        <RotateCcw aria-hidden />
        {t("tryAgain")}
      </Button>
    </Card>
  );
}
