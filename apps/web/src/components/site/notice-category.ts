import type { NoticeCategory } from "@s57/shared";
import { Camera, Megaphone, Receipt, ShieldCheck, UsersRound, Wrench, type LucideIcon } from "lucide-react";
import type { IconTone, Tone } from "@/components/kit";

/** Chip colour and icon per notice category, as in the mockup's notice cards. */
export const NOTICE_CATEGORY_STYLE: Record<NoticeCategory, { tone: Tone; iconTone: IconTone; icon: LucideIcon }> = {
  billing: { tone: "acc", iconTone: "acc", icon: Receipt },
  maintenance: { tone: "warn", iconTone: "warn", icon: Wrench },
  agm: { tone: "info", iconTone: "info", icon: UsersRound },
  security: { tone: "bad", iconTone: "sun", icon: ShieldCheck },
  development: { tone: "good", iconTone: "acc", icon: Camera },
  general: { tone: "neutral", iconTone: "acc", icon: Megaphone },
};
