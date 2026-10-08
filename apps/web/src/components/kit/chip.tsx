import { cn } from "cn";
import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "acc";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted-foreground",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  acc: "bg-accent text-accent-foreground",
};

/** Mockup `.chip`: status pill with a coloured dot (`plain` hides the dot). */
export function Chip({
  tone = "neutral",
  plain = false,
  className,
  children,
}: {
  tone?: Tone;
  plain?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[9px] py-0.5 text-xs font-semibold whitespace-nowrap",
        !plain && "before:size-1.5 before:rounded-full before:bg-current before:opacity-80 before:content-['']",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
