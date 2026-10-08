/**
 * Mockup `.logo`: green square with the red sun and a white stitch line, the
 * society's short mark on top. Fixed flag colours on purpose (same in dark mode).
 */
export function Logo({ mark }: { mark: string }) {
  return (
    <span aria-hidden className="relative size-9 flex-none overflow-hidden rounded-[10px] bg-[#006a4e]">
      <span className="absolute top-[5px] left-[5px] grid size-[22px] place-items-center rounded-full bg-[#c42136] text-[11.5px] font-bold text-white">
        {mark}
      </span>
      <span className="absolute right-[5px] bottom-[5px] left-[5px] h-0.5 bg-[repeating-linear-gradient(90deg,#fff_0_4px,transparent_4px_7px)]" />
    </span>
  );
}
