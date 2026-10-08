"use client";

import { cn } from "cn";
import { FilePen, HardHat, House, Image, LogIn, Megaphone, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/", key: "home", icon: House },
  { href: "/notices", key: "notices", icon: Megaphone },
  { href: "/committee", key: "committee", icon: UsersRound },
  { href: "/developments", key: "developments", icon: HardHat },
  { href: "/gallery", key: "gallery", icon: Image },
  { href: "/forms", key: "forms", icon: FilePen },
] as const;

/** Mockup `.site-nav`: underlined tabs that scroll sideways on phones, Log in at the end. */
export function SiteNav() {
  const t = useTranslations("Site.nav");
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label={t("label")} className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1180px] gap-0.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const current = isCurrent(href);
          return (
            <Link
              key={key}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-[11px] py-3 whitespace-nowrap no-underline",
                current ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-fg",
              )}
            >
              <Icon className="size-[15px]" aria-hidden />
              {t(key)}
            </Link>
          );
        })}
        <Link href="/login" className={cn(buttonVariants(), "my-1.5 ml-auto no-underline")}>
          <LogIn aria-hidden />
          {t("login")}
        </Link>
      </div>
    </nav>
  );
}
