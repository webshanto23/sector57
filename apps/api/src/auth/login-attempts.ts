import { LOGIN_LOCK_MINUTES, LOGIN_MAX_ATTEMPTS } from '@s57/shared';

export type AttemptResult = { locked: false; attemptsLeft: number } | { locked: true; lockedUntil: Date };

/** The lockout rule, shared by real accounts (counted in the database) and unknown phones (counted here). */
export function afterFailure(failedBefore: number, now: Date): AttemptResult & { failedCount: number } {
  const failedCount = failedBefore + 1;
  if (failedCount >= LOGIN_MAX_ATTEMPTS) {
    // The counter restarts, so the user gets the full number of attempts once the lock ends.
    return { locked: true, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000), failedCount: 0 };
  }
  return { locked: false, attemptsLeft: LOGIN_MAX_ATTEMPTS - failedCount, failedCount };
}

type Entry = { failed: number; lockedUntil: Date | null; touched: number };

const MAX_ENTRIES = 10_000;

/**
 * Counts wrong logins for phones without a usable account, so the login form
 * answers exactly as it would for a real one ("2 attempts left", "locked"):
 * nobody can tell which phones are registered. Kept in memory of the one API process.
 */
export class UnknownPhoneAttempts {
  private readonly entries = new Map<string, Entry>();

  lockedUntil(key: string, now: Date): Date | null {
    const entry = this.entries.get(key);
    return entry?.lockedUntil && entry.lockedUntil > now ? entry.lockedUntil : null;
  }

  fail(key: string, now: Date): AttemptResult {
    const entry = this.entries.get(key);
    const lockEnded = entry?.lockedUntil != null && entry.lockedUntil <= now;
    const result = afterFailure(entry && !lockEnded ? entry.failed : 0, now);
    // Re-insert so the Map's order stays "least recently touched first".
    this.entries.delete(key);
    this.entries.set(key, {
      failed: result.failedCount,
      lockedUntil: result.locked ? result.lockedUntil : null,
      touched: now.getTime(),
    });
    this.prune(now);
    return result.locked
      ? { locked: true, lockedUntil: result.lockedUntil }
      : { locked: false, attemptsLeft: result.attemptsLeft };
  }

  /** Drops entries idle longer than a lock, then the oldest beyond the cap. */
  private prune(now: Date) {
    const idleBefore = now.getTime() - LOGIN_LOCK_MINUTES * 60_000;
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= MAX_ENTRIES && entry.touched > idleBefore) break;
      this.entries.delete(key);
    }
  }
}
