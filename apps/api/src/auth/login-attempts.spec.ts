import { afterFailure, UnknownPhoneAttempts } from './login-attempts.js';

const MIN = 60_000;

describe('afterFailure', () => {
  const now = new Date('2026-10-10T06:00:00Z');

  it('counts down from 4 and locks for 60 minutes on the fourth', () => {
    expect(afterFailure(0, now)).toEqual({ locked: false, attemptsLeft: 3, failedCount: 1 });
    expect(afterFailure(2, now)).toEqual({ locked: false, attemptsLeft: 1, failedCount: 3 });
    expect(afterFailure(3, now)).toEqual({
      locked: true,
      lockedUntil: new Date(now.getTime() + 60 * MIN),
      failedCount: 0,
    });
  });
});

describe('UnknownPhoneAttempts', () => {
  it('behaves like a real account: countdown, lock, then four fresh attempts', () => {
    const attempts = new UnknownPhoneAttempts();
    const t0 = new Date('2026-10-10T06:00:00Z');
    expect(attempts.fail('017', t0)).toEqual({ locked: false, attemptsLeft: 3 });
    attempts.fail('017', t0);
    attempts.fail('017', t0);
    expect(attempts.fail('017', t0)).toEqual({ locked: true, lockedUntil: new Date(t0.getTime() + 60 * MIN) });
    expect(attempts.lockedUntil('017', new Date(t0.getTime() + 59 * MIN))).toEqual(new Date(t0.getTime() + 60 * MIN));

    const later = new Date(t0.getTime() + 61 * MIN);
    expect(attempts.lockedUntil('017', later)).toBeNull();
    expect(attempts.fail('017', later)).toEqual({ locked: false, attemptsLeft: 3 });
  });

  it('keeps phones apart', () => {
    const attempts = new UnknownPhoneAttempts();
    const now = new Date();
    attempts.fail('a', now);
    expect(attempts.fail('b', now)).toEqual({ locked: false, attemptsLeft: 3 });
  });
});
