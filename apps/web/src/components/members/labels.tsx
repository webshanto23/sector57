import { formatDate, type Locale, type MemberLink, type Party, type Place, type TenancyStatus } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** "Family renter", "Spouse, owner's household". Works in server and client components. */
export function MemberLinkText({ link }: { link: MemberLink }) {
  const t = useTranslations("Members");
  if (link.role === "owner") return <>{t("owner")}</>;
  if (link.role === "renter") return <>{t(`renterRole.${link.renterType}`)}</>;
  return <>{t(link.renter ? "household.renter" : "household.owner", { relation: t(`relation.${link.relation}`) })}</>;
}

/** "Flat 4B, Road 9 › Plot 14": the place, then the names above it. */
export function placeText(place: Place): string {
  return [place.name, ...[...place.address].reverse()].join(", ");
}

/** A place as a link to its page (units to the units pages, the rest to the map), when the caller may open it. */
export function PlaceLink({ place, open = true }: { place: Place; open?: boolean }) {
  const text = placeText(place);
  if (!open) return <span className="whitespace-normal">{text}</span>;
  const href = place.isUnit ? (`/dashboard/units/${place.id}` as const) : (`/dashboard/property/${place.id}` as const);
  return (
    <Link href={href} className="font-medium whitespace-normal text-fg underline-offset-2 hover:underline">
      {text}
    </Link>
  );
}

/** A person or organisation as a link to their page. */
export function PartyLink({ party }: { party: Party }) {
  const href = party.kind === "person" ? (`/dashboard/members/${party.id}` as const) : (`/dashboard/members/organisations/${party.id}` as const);
  return (
    <Link href={href} className="font-semibold text-fg underline-offset-2 hover:underline">
      {party.name}
    </Link>
  );
}

const STATUS_TONES: Record<TenancyStatus, Tone> = { pending: "warn", active: "good", moving_out: "info", ended: "neutral" };

export function TenancyStatusChip({ status }: { status: TenancyStatus }) {
  const t = useTranslations("Members.tenancyStatus");
  return <Chip tone={STATUS_TONES[status]}>{t(status)}</Chip>;
}

export function VerifiedChip({ verified }: { verified: boolean | null }) {
  const t = useTranslations("Members");
  if (verified === null) return <Chip plain>{t("organisation")}</Chip>;
  return verified ? <Chip tone="good">{t("verified")}</Chip> : <Chip tone="warn">{t("verifyNeeded")}</Chip>;
}

/** "01 Jan 2020 – Now". */
export function DateRange({ start, end }: { start: string; end: string | null }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  return (
    <span className="whitespace-nowrap">
      {formatDate(start, locale, "short")} – {end ? formatDate(end, locale, "short") : t("now")}
    </span>
  );
}
