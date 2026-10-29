import { localDigits, type Locale, type Me } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { LogoutButton } from "@/components/auth/logout-button";
import { Avatar } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** Dashboard header: the logged-in user (links to their account page) and log out. */
export async function UserMenu({ me, locale }: { me: Me; locale: Locale }) {
  const t = await getTranslations("Dashboard");
  const name = (locale === "en" ? me.nameEn : null) ?? me.name ?? localDigits(me.phone, locale);

  return (
    <div className="flex items-center gap-1.5" aria-label={t("userMenu")} role="group">
      <Link
        href="/dashboard/account"
        title={t("nav.account")}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 font-medium text-fg no-underline hover:bg-surface-2"
      >
        <Avatar name={me.name ?? me.phone} src={me.photoUrl} className="size-8 text-[13px]" />
        <span className="max-w-[160px] truncate max-[860px]:sr-only">{name}</span>
      </Link>
      <LogoutButton compact />
    </div>
  );
}
