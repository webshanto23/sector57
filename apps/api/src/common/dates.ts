import { TIME_ZONE } from '@s57/shared';

/**
 * Today's calendar date in the society's time zone, as a UTC-midnight Date:
 * the form Prisma uses for `@db.Date` columns (term dates, event dates).
 */
export function todayDate(now = new Date(), timeZone = TIME_ZONE): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${day}T00:00:00.000Z`);
}

/** `@db.Date` value as `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The moment today ends in the society's time zone (the next local midnight). */
export function endOfToday(now = new Date(), timeZone = TIME_ZONE): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(todayDate(now, timeZone).getTime() + 86_400_000 - offset);
}
