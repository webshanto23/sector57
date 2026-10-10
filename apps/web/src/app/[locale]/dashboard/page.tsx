import { localDigits, type Locale } from "@s57/shared";
import { KeyRound, LayoutDashboard, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { Avatar, Card, Grid, IconBox, PageHeader } from "@/components/kit";
import { redirect } from "@/i18n/navigation";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Account" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Placeholder until the dashboard shell (Step 5): who is logged in, change password, log out. */
export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  // next-intl's redirect is not typed `never`, so return it.
  if (!me) return redirect({ href: { pathname: "/login", query: { next: "/dashboard" } }, locale });
  const t = await getTranslations("Account");
  const name = (locale === "en" ? me.nameEn : null) ?? me.name ?? localDigits(me.phone, locale);

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} actions={<LogoutButton />} />
      <Grid cols={2}>
        <Card className="grid content-start gap-3.5">
          <div className="flex items-center gap-2.5">
            <IconBox icon={UserRound} />
            <h2 className="text-[15px]">{t("signedInAs")}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name={me.name ?? me.phone} />
            <div className="min-w-0">
              <p className="font-semibold">{name}</p>
              <p className="text-[13px] text-muted-foreground">{localDigits(me.phone, locale)}</p>
            </div>
          </div>
          <Card flat className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
            <LayoutDashboard className="mt-0.5 size-[15px] flex-none" aria-hidden />
            {t("comingSoon")}
          </Card>
        </Card>
        <Card className="grid content-start gap-3.5">
          <div className="flex items-center gap-2.5">
            <IconBox icon={KeyRound} />
            <div>
              <h2 className="text-[15px]">{t("changePassword")}</h2>
              <p className="text-[13px] text-muted-foreground">{t("changePasswordSub")}</p>
            </div>
          </div>
          <ChangePasswordForm />
        </Card>
      </Grid>
    </>
  );
}
