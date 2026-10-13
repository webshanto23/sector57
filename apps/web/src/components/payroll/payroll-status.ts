import type { PayrollStatus } from "@s57/shared";
import type { Tone } from "@/components/kit";

/** Chip colour of a payroll run's status. */
export const PAYROLL_STATUS_TONES: Record<PayrollStatus, Tone> = { draft: "warn", approved: "info", paid: "good", void: "bad" };
