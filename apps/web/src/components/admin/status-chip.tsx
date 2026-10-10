import type { UserStatus } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, type Tone } from "@/components/kit";

const TONES: Record<UserStatus, Tone> = { active: "good", invited: "warn", disabled: "bad" };

/** A user's status; a locked account shows "Locked" next to it. */
export function UserStatusChip({ status, locked }: { status: UserStatus; locked?: boolean }) {
  const t = useTranslations("Admin.status");
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Chip tone={TONES[status]}>{t(status)}</Chip>
      {locked ? <Chip tone="warn">{t("locked")}</Chip> : null}
    </span>
  );
}
