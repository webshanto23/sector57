import { CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type Status = { ok: boolean; text: string } | null;

/** Result line under a form: green on success, red alert on failure. */
export function FormStatus({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-[13.5px] ${status.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}
    >
      {status.ok ? (
        <CircleCheck className="mt-0.5 size-[15px] flex-none" aria-hidden />
      ) : (
        <TriangleAlert className="mt-0.5 size-[15px] flex-none" aria-hidden />
      )}
      {status.text}
    </p>
  );
}

/** A plain note above a form (read-only role, own account, and so on). */
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <p className={`rounded-[8px] px-3 py-2.5 text-[13.5px] ${tone === "warn" ? "bg-warn-soft text-warn" : "bg-info-soft text-info"}`}>
      {children}
    </p>
  );
}
