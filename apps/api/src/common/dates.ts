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
