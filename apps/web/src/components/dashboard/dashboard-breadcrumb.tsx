"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { dashboardTrail, pageOwnsTrail, type TrailLabel } from "./breadcrumb-trail";
import type { NavKey } from "./nav";

/** A page-supplied step after the section (the property pages pass the location tree). */
export type TailStep = { key: string; label: string; href: string | null };

/**
 * The trail above every dashboard page, read from the URL. The layout renders it with no `tail`;
 * a page that knows more (the location tree) renders it itself with a `tail`, and the layout's copy
 * steps aside. Hidden on the overview, where it would be a single step.
 */
export function DashboardBreadcrumb({ visible, tail }: { visible: NavKey[]; tail?: TailStep[] }) {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();
  if (!tail && pageOwnsTrail(pathname)) return null;

  const base = dashboardTrail(pathname, visible).map((step, index) => ({ ...step, key: String(index) }));
  const steps = tail ? [...base.slice(0, 2), ...tail.map((step) => ({ ...step, label: { text: step.label } }))] : base;
  if (steps.length < 2) return null;

  const labelOf = (label: TrailLabel) => ("text" in label ? label.text : "nav" in label ? t(`nav.${label.nav}`) : t(`crumbs.${label.crumb}`));
  const last = steps.length - 1;

  return (
    <nav aria-label={t("breadcrumb")} className="mb-3 text-[13px] text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-1" aria-current={index === last ? "page" : undefined}>
            {index === last ? (
              <span className="font-semibold text-fg">{labelOf(step.label)}</span>
            ) : step.href ? (
              <Link href={step.href} className="font-medium text-fg underline-offset-2 hover:underline">
                {labelOf(step.label)}
              </Link>
            ) : (
              <span>{labelOf(step.label)}</span>
            )}
            {index < last ? <ChevronRight className="size-3.5" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
