import type { ReactNode } from "react";

/** Mockup `ph()`: page title, optional subtitle, actions on the right (wrapping on phones). */
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl min-[600px]:text-[23px]">{title}</h1>
        {sub ? <p className="mt-0.5 text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
