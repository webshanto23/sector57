import { localDigits, pick, type LocationNode, type Locale, type PartyName } from "@s57/shared";
import { MapPin, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Chip, IconBox } from "@/components/kit";
import { Link } from "@/i18n/navigation";
import { levelName } from "./labels";
import { unitTypeIcon } from "./unit-types";

/** Show at most this many owner names on a card; the rest become "+N more". */
const CARD_OWNERS = 2;

/**
 * One child in the grid: a link to its own page (units go to the units pages). Search results
 * add the address and the owners (null: the caller may not view them, so the line is left out).
 */
export async function ChildCard({
  node,
  locale,
  unitsOpen,
  address,
  owners,
  home,
  pickGroup,
}: {
  node: LocationNode;
  locale: Locale;
  unitsOpen: boolean;
  address?: string[];
  owners?: PartyName[] | null;
  /** For a unit over several storeys: the name of its own storey, listed first. */
  home?: string;
  /** Adds a tick box for "Remove selected" (`RemoveSelected` with this group). */
  pickGroup?: string;
}) {
  const t = await getTranslations("Property");
  const ownerNames = (owners ?? []).slice(0, CARD_OWNERS).map((owner) => (locale === "en" ? (owner.nameEn ?? owner.name) : owner.name));
  const href = node.isUnit ? (unitsOpen ? `/dashboard/units/${node.id}` : null) : `/dashboard/property/${node.id}`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold break-words">{node.name}</span>
        <IconBox icon={node.isUnit ? unitTypeIcon(node.unitType?.code) : MapPin} size="sm" tone={node.isActive ? undefined : "warn"} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip plain>{node.unitType ? pick(node.unitType.nameBn, node.unitType.nameEn, locale) : levelName(node, locale)}</Chip>
        {node.alsoOn.length > 0 ? <Chip tone="info">{t("storeys.floors", { floors: [home, ...node.alsoOn].filter(Boolean).join(" + ") })}</Chip> : null}
        {!node.isActive ? <Chip tone="warn">{t("inactive")}</Chip> : null}
      </div>
      {address?.length ? <p className="text-[12.5px] break-words text-muted-foreground">{address.join(" › ")}</p> : null}
      {owners ? (
        <p className="flex items-start gap-1.5 text-[13px]">
          <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="text-muted-foreground">{t("levelOwner", { level: levelName(node, locale) })}: </span>
            {owners.length === 0 ? (
              <span className="text-muted-foreground">{t("ownerNone")}</span>
            ) : (
              <>
                <span className="font-medium">{ownerNames.join(", ")}</span>
                {owners.length > CARD_OWNERS ? (
                  <span className="text-muted-foreground"> {localDigits(t("ownerMore", { count: owners.length - CARD_OWNERS }), locale)}</span>
                ) : null}
              </>
            )}
          </span>
        </p>
      ) : null}
      {node.code ? <p className="num text-[12.5px] text-muted-foreground">{t("cardCode", { code: node.code })}</p> : null}
      {!node.isUnit ? (
        <p className="text-[12.5px] text-muted-foreground">
          {localDigits(t("childCount", { count: node.childCount }), locale)} · {localDigits(t("unitCount", { count: node.unitCount }), locale)}
        </p>
      ) : null}
    </>
  );
  const className = "grid content-start gap-2 rounded-[12px] border border-line bg-surface p-3.5";
  const card = href ? (
    <Link href={href} className={`${className} transition-colors hover:border-muted-foreground`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
  if (!pickGroup) return card;
  // The tick box sits on the card, outside the link, so ticking never opens the place.
  return (
    <div className="relative grid">
      {card}
      <input
        type="checkbox"
        data-pick={pickGroup}
        value={node.id}
        aria-label={t("remove.pick", { name: node.name })}
        className="absolute right-3 bottom-3 size-4 accent-primary"
      />
    </div>
  );
}
