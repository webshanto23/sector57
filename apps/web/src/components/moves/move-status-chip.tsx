import type { MoveStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const TONE: Record<MoveStatus, Tone> = { open: "warn", done: "good", cancelled: "neutral" };

export function MoveStatusChip({ status }: { status: MoveStatus }) {
  const t = useTranslations("Moves.status");
  return <Chip tone={TONE[status]}>{t(status)}</Chip>;
}
