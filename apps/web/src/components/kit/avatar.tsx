import { initials } from "@s57/shared";
import { cn } from "cn";

/** Mockup `.av`: round initials badge; `lg` is the committee portrait size. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full bg-accent font-bold text-accent-foreground",
        size === "md"
          ? "size-[38px] text-[15px]"
          : "size-[74px] text-[26px] shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--accent-brand-soft)]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
