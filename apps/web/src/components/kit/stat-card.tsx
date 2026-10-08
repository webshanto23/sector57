import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";
import { IconBox, type IconTone } from "./icon-box";

/** Mockup `stat()`: label, big number, optional note, small icon box top right. */
export function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: IconTone;
}) {
  return (
    <Card className="grid gap-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <IconBox icon={icon} tone={tone} size="sm" />
      </div>
      <div className="num text-xl leading-[1.2] font-bold min-[600px]:text-[25px]">{value}</div>
      {note ? <div className="text-[12.5px] text-muted-foreground">{note}</div> : null}
    </Card>
  );
}
