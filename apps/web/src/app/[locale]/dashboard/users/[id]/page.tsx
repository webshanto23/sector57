import { canAnywhere, formatDate, localDigits, pick, type Locale } from "@s57/shared";
import { ChevronLeft, ShieldCheck, UserRound, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { UserStatusChip } from "@/components/admin/status-chip";
import { UserAccountActions, UserProfileForm, UserRolesForm } from "@/components/admin/user-panels";
import { Avatar, Card, Chip, IconBox, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUser, getUserFormOptions } from "@/lib/api/admin";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/users/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  await requirePermission("users");
  const user = await getUser(id);
  return user ? { title: user.name ? pick(user.name, user.nameEn, locale as Locale) : user.phone } : {};
}

/** One user: profile, roles with areas, and the account actions (disable, reset password). */
export default async function UserPage({ params }: PageProps<"/[locale]/dashboard/users/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("users");
  const [t, tAdmin, user, options] = await Promise.all([
    getTranslations("Admin.users"),
    getTranslations("Admin"),
    getUser(id),
    getUserFormOptions(),
  ]);
  if (!user) notFound();

  const canEdit = canAnywhere(me.access, "users", "edit");
  const manage = canEdit && user.canManage;
  const name = user.name ? pick(user.name, user.nameEn, locale) : localDigits(user.phone, locale);

  return (
    <>
      <PageHeader
        title={name}
        sub={t("created", { date: formatDate(user.createdAt, locale, "short") })}
        actions={
          <Link href="/dashboard/users" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("backToList")}
          </Link>
        }
      />

      <div className="grid gap-3.5">
        {user.isSelf ? <Note>{t("selfNote")}</Note> : null}
        {!user.isSelf && canEdit && !user.canManage ? <Note tone="warn">{t("beyondNote")}</Note> : null}
        {user.lockedUntil ? (
          <Note tone="warn">{t("lockedUntil", { time: formatDate(user.lockedUntil, locale, "time") })}</Note>
        ) : null}

        <div className="grid gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="grid content-start gap-3.5">
            <div className="flex items-center gap-3">
              <Avatar name={user.name ?? user.phone} />
              <div className="min-w-0">
                <p className="font-semibold">{name}</p>
                <p className="num text-[13px] text-muted-foreground">{localDigits(user.phone, locale)}</p>
              </div>
              <span className="ml-auto">
                <UserStatusChip status={user.status} locked={user.lockedUntil !== null} />
              </span>
            </div>
            <div className="flex items-center gap-2.5 border-t border-line pt-3.5">
              <IconBox icon={UserRound} size="sm" />
              <h2 className="text-[15px]">{t("profile")}</h2>
            </div>
            <UserProfileForm key={user.id} user={user} editable={canEdit && (user.isSelf || user.canManage)} />
          </Card>

          <div className="grid content-start gap-3.5">
            <Card className="grid content-start gap-3.5">
              <div className="flex items-center gap-2.5">
                <IconBox icon={ShieldCheck} size="sm" />
                <div>
                  <h2 className="text-[15px]">{t("roles")}</h2>
                  <p className="text-[13px] text-muted-foreground">{t("rolesSub")}</p>
                </div>
              </div>
              {manage ? (
                <UserRolesForm key={user.id} user={user} options={options} />
              ) : user.roles.length === 0 ? (
                <p className="text-muted-foreground">{t("noRoles")}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <li key={`${role.roleId}:${role.scopeLocationId}`}>
                      <Chip tone={role.isSystem ? "acc" : "neutral"} plain>
                        {`${role.roleName} · ${role.scopeName ?? tAdmin("wholeSociety")}`}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {manage ? (
              <Card className="grid content-start gap-3.5">
                <div className="flex items-center gap-2.5">
                  <IconBox icon={UserRoundCog} size="sm" />
                  <div>
                    <h2 className="text-[15px]">{t("account")}</h2>
                    <p className="text-[13px] text-muted-foreground">{t("accountSub")}</p>
                  </div>
                </div>
                <UserAccountActions user={user} />
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
