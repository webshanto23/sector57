import type { NoticeStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const NOTICE_TONES: Record<NoticeStatus, Tone> = { published: "good", scheduled: "info", internal: "neutral" };

/** Published, scheduled or internal (not on the website). */
export function NoticeStatusChip({ status }: { status: NoticeStatus }) {
  const t = useTranslations("Cms.notices.statuses");
  return <Chip tone={NOTICE_TONES[status]}>{t(status)}</Chip>;
}

/** An album is either on the website or a draft. */
export function PublishedChip({ published }: { published: boolean }) {
  const t = useTranslations("Cms");
  return <Chip tone={published ? "good" : "neutral"}>{published ? t("published") : t("draft")}</Chip>;
}
