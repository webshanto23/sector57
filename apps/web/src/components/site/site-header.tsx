import { cn } from "cn";
import type { ReactNode } from "react";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";
import type { Brand } from "@/lib/brand";
import { Logo } from "./logo";

/**
 * Mockup `.top`: sticky bar with the brand on the left, language and theme on the right.
 * `wide` matches the dashboard's 1440 px frame; `actions` sits before the toggles (the user menu).
 */
export function SiteHeader({ brand, wide = false, actions }: { brand: Brand; wide?: boolean; actions?: ReactNode }) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line bg-surface">
      <div
        className={cn(
          "mx-auto flex flex-wrap items-center gap-2 px-4 py-[9px] min-[601px]:gap-3.5",
          wide ? "max-w-[1440px]" : "max-w-[1180px]",
        )}
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5 leading-tight font-bold text-fg no-underline">
          <Logo mark={brand.mark} />
          <span className="min-w-0">
            {brand.name}
            {brand.place ? (
              <span className="block text-xs font-medium text-muted-foreground max-[600px]:hidden">{brand.place}</span>
            ) : null}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
