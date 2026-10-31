import {
  formatDate,
  levelCountCards,
  localDigits,
  pick,
  type LevelCounts,
  type Locale,
  type LocationLevel,
  type LocationNode,
  type Ownership,
} from "@s57/shared";
import { cn } from "cn";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Card } from "@/components/kit";

const COLUMNS: Record<number, string> = { 4: "min-[861px]:grid-cols-4", 5: "min-[861px]:grid-cols-5", 6: "min-[861px]:grid-cols-6" };

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <Card className="grid content-start gap-0.5 rounded-[10px] px-3.5 py-2.5 min-[600px]:px-3.5 min-[600px]:py-2.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="break-words">
        <span className="num text-[15.5px] font-semibold">{value}</span>
        {note ? <span className="num ml-1 text-[11.5px] text-muted-foreground">{note}</span> : null}
      </span>
    </Card>
  );
}

/**
 * A place's summary. Where its level can have owners and the caller may see them: who owns it.
 * Otherwise one count per level below it, as set in the level settings.
 */
export async function LocationStats({
  location,
  levels,
  counts,
  owners,
  documentCount,
  locale,
}: {
  location: LocationNode;
  levels: LocationLevel[];
  counts: LevelCounts;
  owners: Ownership[] | null;
  documentCount: number | null;
  locale: Locale;
}) {
  const t = await getTranslations("Property");
  let cards: ReactNode[];
  if (location.canOwn && owners !== null) {
    const current = owners.filter((row) => row.endDate === null);
    const first = current[0];
    const since = current.map((row) => row.startDate).sort()[0];
    const more = current.length > 1 ? localDigits(t("ownerMore", { count: current.length - 1 }), locale) : undefined;
    cards = [
      <Stat
        key="owner"
        label={t("pageStats.currentOwner")}
        value={first ? pick(first.owner.name, first.owner.nameEn, locale) : t("ownerNone")}
        note={more ?? (first ? `${localDigits(first.sharePercent, locale)}%` : undefined)}
      />,
      <Stat key="since" label={t("pageStats.ownerSince")} value={since ? formatDate(since, locale, "short") : "—"} />,
      <Stat key="past" label={t("pageStats.pastOwners")} value={localDigits(owners.length - current.length, locale)} />,
      ...(documentCount !== null ? [<Stat key="documents" label={t("pageStats.documents")} value={localDigits(documentCount, locale)} />] : []),
    ];
  } else {
    cards = levelCountCards(location, levels, counts).map((card) => (
      <Stat key={card.levelId} label={pick(card.nameBn, card.nameEn, locale)} value={localDigits(card.count, locale)} />
    ));
  }
  if (cards.length === 0) return null;

  return <div className={cn("grid grid-cols-2 gap-2.5", COLUMNS[Math.min(6, Math.max(4, cards.length))])}>{cards}</div>;
}
