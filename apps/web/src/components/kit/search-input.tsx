import { cn } from "cn";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { inputClass } from "./field";

/** Mockup `.search`: input with a leading search icon, 200–320px wide in toolbars. */
export function SearchInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <div className={cn("relative max-w-80 min-w-[200px] flex-1", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
      />
      <input type="search" className={cn(inputClass, "pl-[34px]")} {...props} />
    </div>
  );
}
