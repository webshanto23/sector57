import type { FormStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const TONES: Record<FormStatus, Tone> = { new: "info", in_review: "warn", approved: "good", rejected: "bad" };

/** An application's status as a coloured chip. Works in server and client components. */
export function FormStatusChip({ status }: { status: FormStatus }) {
  const t = useTranslations("FormsAdmin");
  return <Chip tone={TONES[status]}>{t(`status.${status}`)}</Chip>;
}
