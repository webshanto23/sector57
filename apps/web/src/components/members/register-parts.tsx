import { formatNumber, localDigits, phoneLinks, type HoldingCount, type Locale } from "@s57/shared";
import { MessageCircle, Phone, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Chip } from "@/components/kit";
import { Link } from "@/i18n/navigation";

/** One query-string value from `searchParams`, or undefined when missing or blank. */
export function searchText(search: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = search[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** "Plot 2 · Flat 1": what someone owns now, top level first. */
export function HoldingChips({ holdings }: { holdings: HoldingCount[] }) {
  const locale = useLocale() as Locale;
  if (holdings.length === 0) return <>—</>;
  return (
    <span className="flex flex-wrap gap-1">
      {holdings.map((holding) => (
        <Chip key={holding.levelId} plain>
          {locale === "en" ? (holding.nameEn ?? holding.nameBn) : holding.nameBn} {formatNumber(holding.count, locale)}
        </Chip>
      ))}
    </span>
  );
}

/** The phone number with Call and WhatsApp links (no SMS). */
export function PhoneActions({ phone, name }: { phone: string | null; name: string }) {
  const t = useTranslations("Registers");
  const locale = useLocale() as Locale;
  if (!phone) return <>—</>;
  const links = phoneLinks(phone);
  const iconLink = "inline-flex size-8 items-center justify-center rounded-md border border-line text-muted-foreground hover:bg-muted hover:text-fg";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="num">{localDigits(phone, locale)}</span>
      {links ? (
        <>
          <a href={links.tel} className={iconLink} aria-label={t("call", { name })} title={t("call", { name })}>
            <Phone className="size-3.5" aria-hidden />
          </a>
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={iconLink}
            aria-label={t("whatsapp", { name })}
            title={t("whatsapp", { name })}
          >
            <MessageCircle className="size-3.5" aria-hidden />
          </a>
        </>
      ) : null}
    </span>
  );
}

/** "Only under Road 9 · Show all" above a register opened for one area. */
export function AreaNote({ name, clear }: { name: string | null; clear: ComponentProps<typeof Link>["href"] }) {
  const t = useTranslations("Registers");
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
      <Chip tone="info" plain>
        {name ? t("inArea", { name }) : t("inSomeArea")}
      </Chip>
      <Link href={clear} className="inline-flex items-center gap-1 font-semibold text-primary">
        <X className="size-3.5" aria-hidden />
        {t("clearArea")}
      </Link>
    </p>
  );
}
