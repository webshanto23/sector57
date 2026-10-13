import type { AssetStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const TONES: Record<AssetStatus, Tone> = { in_use: "good", repair: "warn", retired: "neutral", lost: "bad" };

/** An asset's status as a coloured chip. */
export function AssetStatusChip({ status }: { status: AssetStatus }) {
  const t = useTranslations("Assets.status");
  return <Chip tone={TONES[status]}>{t(status)}</Chip>;
}
