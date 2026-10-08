import type { ReactNode } from "react";

/** Mockup `input, select, textarea` base style; also used by SearchInput. */
export const inputClass =
  "w-full rounded-[8px] border border-line bg-surface px-[11px] py-2 text-fg placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-invalid:border-bad";

/** Mockup `.field`: label above control, 5px gap. */
export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-[5px]">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
