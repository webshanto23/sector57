import { cn } from "cn";

/** Mockup `.kantha`: a dashed "stitch" divider in sun red, or brand green. Use sparingly. */
export function Kantha({ green = false, className }: { green?: boolean; className?: string }) {
  return (
    <hr
      className={cn(
        "m-0 h-0.5 border-0",
        green
          ? "bg-[repeating-linear-gradient(90deg,var(--accent-brand)_0_9px,transparent_9px_15px)]"
          : "bg-[repeating-linear-gradient(90deg,var(--sun)_0_9px,transparent_9px_15px)]",
        className,
      )}
    />
  );
}
