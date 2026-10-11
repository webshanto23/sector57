import { localDigits, type Locale } from "@s57/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Href = ComponentProps<typeof Link>["href"];

/** Previous / page x of y / next, under a paged list. Nothing when there is one page. */
export async function Pager({ locale, page, pages, href }: { locale: Locale; page: number; pages: number; href: (page: number) => Href }) {
  if (pages <= 1) return null;
  const common = await getTranslations("Common");
  const label = common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) });

  return (
    <nav aria-label={label} className="mt-5 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonVariants({ variant: "outline" })} rel="prev">
          <ChevronLeft aria-hidden />
          {common("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonVariants({ variant: "outline" })} rel="next">
          {common("next")}
          <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
