import { cn } from "cn";

const TONES = {
  acc: "bg-primary",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
} as const;

/** Mockup `bar()`: 7px rounded progress track. */
export function ProgressBar({
  value,
  tone = "acc",
  label,
  className,
}: {
  value: number;
  tone?: keyof typeof TONES;
  label?: string;
  className?: string;
}) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      className={cn("h-[7px] overflow-hidden rounded-full bg-surface-2", className)}
    >
      <i className={cn("block h-full rounded-full", TONES[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}
