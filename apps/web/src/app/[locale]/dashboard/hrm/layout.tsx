import { canAnywhere, type Locale } from "@s57/shared";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { HrmTabs, type HrmTab } from "@/components/staff/hrm-tabs";
import { getMe } from "@/lib/api/session";

/** Staff, the day's attendance and payroll, each shown only to who may open it. */
export default async function HrmLayout({ params, children }: LayoutProps<"/[locale]/dashboard/hrm">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const me = await getMe();
  if (!me) notFound();
  const tabs: HrmTab[] = [
    ...(canAnywhere(me.access, "staff") ? (["staff"] as const) : []),
    ...(canAnywhere(me.access, "attendance") ? (["attendance"] as const) : []),
    ...(canAnywhere(me.access, "payroll") ? (["payroll"] as const) : []),
  ];
  if (tabs.length === 0) notFound();

  return (
    <>
      <HrmTabs tabs={tabs} />
      {children}
    </>
  );
}
