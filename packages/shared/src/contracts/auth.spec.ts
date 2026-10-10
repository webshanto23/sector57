import { changePasswordSchema, loginSchema, newPassword } from './auth.js';

describe('loginSchema', () => {
  it('normalises the phone and keeps the password as typed', () => {
    const parsed = loginSchema.parse({ phone: '+880 1711-000000', password: ' secret ' });
    expect(parsed).toEqual({ phone: '01711000000', password: ' secret ' });
  });

  it('accepts Bangla digits in the phone', () => {
    expect(loginSchema.parse({ phone: '০১৭১১০০০০০০', password: 'x' }).phone).toBe('01711000000');
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ phone: '01711000000', password: '' }).success).toBe(false);
  });
});

describe('newPassword', () => {
  it('needs at least 8 characters', () => {
    expect(newPassword.safeParse('short').success).toBe(false);
    expect(newPassword.safeParse('long enough').success).toBe(true);
  });

  it('normalises Bangla to NFC', () => {
    // য় written as য + nukta (decomposed) becomes the single precomposed character.
    const decomposed = 'পাসওয়ার্ড১২৩৪';
    expect(newPassword.parse(decomposed)).toBe(decomposed.normalize('NFC'));
  });
});

describe('changePasswordSchema', () => {
  it('rejects a new password equal to the current one', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'same-password', newPassword: 'same-password' });
    expect(result.success).toBe(false);
  });
});
