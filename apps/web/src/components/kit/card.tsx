import { cn } from "cn";
import type { ComponentProps } from "react";

/** Mockup `.card`: white surface, hairline border, 12px radius. `flat` = `.card.flat`. */
export function Card({ className, flat = false, ...props }: ComponentProps<"div"> & { flat?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[12px] border p-3.5 min-[600px]:p-4",
        flat ? "border-transparent bg-surface-2" : "border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** Mockup `.stack`: vertical grid with a 10px gap. */
export function Stack({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid content-start gap-2.5", className)} {...props} />;
}

const COLUMNS = {
  // .g2: one column up to 700px
  2: "grid-cols-1 min-[701px]:grid-cols-2",
  // .g3: two columns on tablets (an odd last card spans the row), one on phones
  3: "grid-cols-1 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[600px]:max-[1099px]:[&>:last-child:nth-child(odd)]:col-span-full",
  // .g4: two columns below desktop, one on very narrow phones
  4: "grid-cols-1 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4",
} as const;

/** Mockup `.grid.g2/.g3/.g4` with its breakpoints (phone < 600, tablet 600–1099, desktop ≥ 1100). */
export function Grid({ cols, className, ...props }: ComponentProps<"div"> & { cols: keyof typeof COLUMNS }) {
  return <div className={cn("grid gap-3.5", COLUMNS[cols], className)} {...props} />;
}
