import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { requirePermission } from "@/lib/api/session";

/** Work orders, for anyone who may see them somewhere. */
export default async function WorkLayout({ params, children }: LayoutProps<"/[locale]/dashboard/work">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("work_orders");
  return children;
}
