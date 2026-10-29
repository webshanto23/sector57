import { initials } from "@s57/shared";
import { cn } from "cn";
import Image from "next/image";

/** Mockup `.av`: round photo, or initials when there is none; `lg` is the committee portrait size. */
export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: "md" | "lg"; className?: string }) {
  const box =
    size === "md" ? "size-[38px] text-[15px]" : "size-[74px] text-[26px] shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--accent-brand-soft)]";
  if (src) {
    const px = size === "md" ? 38 : 74;
    return <Image src={src} alt="" width={px} height={px} unoptimized className={cn("flex-none rounded-full bg-accent object-cover", box, className)} />;
  }
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center rounded-full bg-accent font-bold text-accent-foreground", box, className)}>
      {initials(name)}
    </span>
  );
}
