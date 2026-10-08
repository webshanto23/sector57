import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type IconTone = "acc" | "sun" | "warn" | "info";

const TONES: Record<IconTone, string> = {
  acc: "bg-accent text-accent-foreground",
  sun: "bg-sun-soft text-sun",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
};

/** Mockup `.icobox`: tinted rounded square holding one icon. */
export function IconBox({
  icon: Icon,
  tone = "acc",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-[10px]",
        size === "md" ? "size-[38px]" : "size-8",
        TONES[tone],
        className,
      )}
    >
      <Icon className={size === "md" ? "size-[18px]" : "size-[15px]"} strokeWidth={1.75} />
    </span>
  );
}

/** Mockup `ttl()`: icon box + section heading. */
export function IconTitle({
  icon,
  tone,
  as: Heading = "h2",
  children,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  as?: "h2" | "h3";
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <IconBox icon={icon} tone={tone} />
      <Heading>{children}</Heading>
    </div>
  );
}
