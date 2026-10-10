import type { Locale } from "@s57/shared";
import { KeyRound, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { Card, IconBox } from "@/components/kit";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth" });
  return { title: t("loginTitle"), robots: { index: false, follow: false } };
}

/** Phone + password login (the mockup has no login screen; built from its card, field and button styles). */
export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, query] = await Promise.all([getTranslations("Auth"), searchParams]);

  return (
    <div className="mx-auto grid w-full max-w-[420px] gap-3.5 py-2 min-[600px]:py-8">
      <Card className="grid gap-4 min-[600px]:p-6">
        <div className="flex items-center gap-2.5">
          <IconBox icon={LockKeyhole} />
          <div>
            <h1 className="text-xl">{t("loginTitle")}</h1>
          </div>
        </div>
        <p className="text-[13.5px] text-muted-foreground">{t("loginSub")}</p>
        <LoginForm next={safeNext(query["next"])} />
      </Card>
      <p className="flex items-start gap-2 px-1 text-[13px] text-muted-foreground">
        <KeyRound className="mt-0.5 size-[15px] flex-none" aria-hidden />
        {t("forgot")}
      </p>
    </div>
  );
}
