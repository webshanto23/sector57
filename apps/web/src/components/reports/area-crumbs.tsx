import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

type Href = ComponentProps<typeof Link>["href"];

/** The way down to the place a report looks under; places the user may open are links. */
export function AreaCrumbs({
  top,
  topHref,
  crumbs,
  href,
  label,
}: {
  top: string;
  topHref: Href;
  crumbs: { id: string; name: string; open: boolean }[];
  href: (id: string) => Href;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-3.5 flex flex-wrap items-center gap-1 text-[13.5px]">
      <Link href={topHref} className="font-semibold text-primary">
        {top}
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={crumb.id} className="inline-flex items-center gap-1">
          <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
          {crumb.open && index < crumbs.length - 1 ? (
            <Link href={href(crumb.id)} className="font-semibold text-primary">
              {crumb.name}
            </Link>
          ) : (
            <span aria-current={index === crumbs.length - 1 ? "location" : undefined}>{crumb.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
