import { localDigits, type Locale } from "@s57/shared";
import { KeyRound, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Avatar, Card, Grid, IconBox, PageHeader } from "@/components/kit";
import { getMe } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.account") };
}

/** The user's own account: who is logged in, change password. Open to every logged-in user. */
export default async function AccountPage({ params }: PageProps<"/[locale]/dashboard/account">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, tDash, me] = await Promise.all([getTranslations("Account"), getTranslations("Dashboard"), getMe()]);
  // The layout has already sent a logged-out visitor to /login.
  if (!me) return null;
  const name = (locale === "en" ? me.nameEn : null) ?? me.name ?? localDigits(me.phone, locale);

  return (
    <>
      <PageHeader title={tDash("nav.account")} sub={t("sub")} />
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
