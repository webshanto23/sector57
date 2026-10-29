import type { ReactNode } from "react";

/** Mockup `ph()`: page title, optional subtitle and leading avatar, actions on the right (wrapping on phones). */
export function PageHeader({ title, sub, actions, lead }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="min-w-0">
          <h1 className="text-xl min-[600px]:text-[23px]">{title}</h1>
          {sub ? <p className="mt-0.5 text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
