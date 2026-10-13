import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { requirePermission } from "@/lib/api/session";

/** The helpdesk, for anyone who may see tickets somewhere. */
export default async function HelpdeskLayout({ params, children }: LayoutProps<"/[locale]/dashboard/helpdesk">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("helpdesk");
  return children;
}
