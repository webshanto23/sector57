import type { AttendanceStatus } from "@s57/shared";
import type { Tone } from "@/components/kit";

/** Chip tone of each attendance status, the same on the roster and the calendar. */
export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  present: "good",
  half_day: "info",
  leave: "warn",
  absent: "bad",
  off: "neutral",
};

/** Cell colours of each status (the chip tones without the dot). */
export const ATTENDANCE_CELL: Record<AttendanceStatus, string> = {
  present: "bg-good-soft text-good",
  half_day: "bg-info-soft text-info",
  leave: "bg-warn-soft text-warn",
  absent: "bg-bad-soft text-bad",
  off: "bg-surface-2 text-muted-foreground",
};
