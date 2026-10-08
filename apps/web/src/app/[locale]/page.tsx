import { pick } from "@s57/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitch } from "@/components/locale-switch";
import { Card, Kantha } from "@/components/kit";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { api } from "@/lib/api/client";

// Placeholder until Step 1 builds the public website.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as "bn" | "en");
  const t = await getTranslations("Common");
  const site = await getTranslations("Site");

  const { data: society } = await api.GET("/society", { cache: "no-store" }).catch(() => ({ data: undefined }));
  const name = society ? pick(society.nameBn, society.nameEn, locale as "bn" | "en") : t("societyName");

  return (
    <main className="mx-auto grid w-full max-w-[1180px] gap-6 px-4 py-[22px]">
      <div className="flex justify-end gap-1.5">
        <LocaleSwitch />
        <ThemeToggle />
      </div>
      <Card className="grid gap-3.5">
        <h1 className="font-display text-[clamp(25px,3.4vw,34px)] leading-[1.35]">{name}</h1>
        <Kantha />
        <p className="text-muted-foreground">{site("comingSoon")}</p>
      </Card>
    </main>
  );
}
