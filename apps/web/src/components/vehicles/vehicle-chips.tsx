import { formatDate, type Locale, type StickerRef, type StickerState } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const STATE_TONES: Record<StickerState, Tone> = { active: "good", expired: "warn", revoked: "bad", replaced: "neutral" };

/** A sticker's state (expired derived from its last day) as a coloured chip. */
export function StickerStateChip({ state }: { state: StickerState }) {
  const t = useTranslations("Vehicles.stickerState");
  return <Chip tone={STATE_TONES[state]}>{t(state)}</Chip>;
}

/** A vehicle's latest sticker: its number, state and last day; "no sticker" when it never had one. */
export function StickerCell({ sticker }: { sticker: StickerRef | null }) {
  const t = useTranslations("Vehicles");
  const locale = useLocale() as Locale;
  if (!sticker) return <Chip tone="warn" plain>{t("noSticker")}</Chip>;
  return (
    <span className="grid justify-items-start gap-0.5">
      <StickerStateChip state={sticker.state} />
      <span className="num text-[12.5px] text-muted-foreground">
        {sticker.stickerNo} · {t("validUntil", { date: formatDate(sticker.validUntil, locale, "short") })}
      </span>
    </span>
  );
}
