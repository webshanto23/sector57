import type { Overview } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { DueChip } from "@/components/helpdesk/ticket-chips";
import { Card } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** Mockup "Helpdesk": the tickets due soonest in the user's area (the most overdue first), each opening its page. */
export async function HelpdeskCard({ helpdesk }: { helpdesk: NonNullable<Overview["helpdesk"]> }) {
  const t = await getTranslations("Overview.helpdesk");
  return (
    <Card className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">{t("title")}</h3>
        <Link href="/dashboard/helpdesk" className="text-[12.5px] font-medium text-primary">
          {t("all")}
        </Link>
      </div>
      {helpdesk.items.length === 0 ? <p className="text-[13.5px] text-muted-foreground">{t("empty")}</p> : null}
      {helpdesk.items.map((item) => (
        <Link key={item.id} href={`/dashboard/helpdesk/${item.id}`} className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
          <span className="min-w-0 truncate text-[14px]">{item.title}</span>
          <DueChip status={item.status} dueAt={item.dueAt} overdue={item.overdue} />
        </Link>
      ))}
    </Card>
  );
}
