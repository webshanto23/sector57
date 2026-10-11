import { TIME_ZONE } from "@s57/shared";

// Bangladesh has kept UTC+6 all year since 2009.
const OFFSET = "+06:00";

/** An instant as the value of a `datetime-local` input, in Dhaka time (`2026-10-10T16:30`). */
export function toDhakaInput(value: string | Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}

/** A `datetime-local` value read as Dhaka time, as an ISO instant with offset. */
export function fromDhakaInput(value: string): string {
  return `${value}:00${OFFSET}`;
}

export const DHAKA_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Today's calendar date in Dhaka, `YYYY-MM-DD` (the value of a `date` input). */
export function todayInDhaka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** Today in Dhaka, `days` from now, as `YYYY-MM-DD` (a `date` input's value). */
export function dhakaDay(days = 0): string {
  return toDhakaInput(new Date(Date.now() + days * 86_400_000)).slice(0, 10);
}
