import { cn } from "cn";

const SIZES = {
  md: { box: "size-9 rounded-[10px]", sun: "top-[5px] left-[5px] size-[22px] text-[11.5px]", stitch: "right-[5px] bottom-[5px] left-[5px] h-0.5" },
  // The A4 bill's badge, about 15 mm across.
  lg: { box: "size-[57px] rounded-[14px]", sun: "top-[8px] left-[8px] size-[35px] text-[18px]", stitch: "right-[8px] bottom-[8px] left-[8px] h-[3px]" },
} as const;

/**
 * Mockup `.logo`: green square with the red sun and a white stitch line, the
 * society's short mark on top. Fixed flag colours on purpose (same in dark mode).
 */
export function Logo({ mark, size = "md" }: { mark: string; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span aria-hidden className={cn("relative flex-none overflow-hidden bg-[#006a4e]", s.box)}>
      <span className={cn("absolute grid place-items-center rounded-full bg-[#c42136] font-bold text-white", s.sun)}>{mark}</span>
      <span className={cn("absolute bg-[repeating-linear-gradient(90deg,#fff_0_4px,transparent_4px_7px)]", s.stitch)} />
    </span>
  );
}
