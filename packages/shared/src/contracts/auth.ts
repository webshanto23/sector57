import { z } from 'zod';
import { bdPhone, optionalText, text } from '../schemas.js';
import { toNFC } from '../text.js';
import { accessSchema } from './permissions.js';

/** Wrong passwords in a row before the account locks. */
export const LOGIN_MAX_ATTEMPTS = 4;
/** How long a locked account stays locked. */
export const LOGIN_LOCK_MINUTES = 60;

/** Cookie and header names shared by the API (sets them) and the web app (reads or forwards them). */
export const AUTH_COOKIES = {
  /** Access token (JWT), 60 minutes. httpOnly. */
  access: 's57_at',
  /** Refresh token, 7 days, replaced on every use. httpOnly. */
  refresh: 's57_rt',
  /** CSRF token, readable by the page so it can echo it in `CSRF_HEADER`. */
  csrf: 's57_csrf',
} as const;
export const CSRF_HEADER = 'x-csrf-token';

// Passwords are NFC-normalised (a Bangla keyboard may type either form) but never trimmed.
const password = z.string().max(128).transform(toNFC);

/** A password the user chooses. */
export const newPassword = password.pipe(z.string().min(8, 'password_too_short'));

/** `POST /auth/login`. Any non-empty password is checked; the length rule applies only to new ones. */
export const loginSchema = z.object({
  phone: bdPhone,
  password: password.pipe(z.string().min(1)),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** `POST /me/password`. */
export const changePasswordSchema = z
  .object({
    currentPassword: password.pipe(z.string().min(1)),
    newPassword,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'password_unchanged',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** `GET /me` and the body of a successful login. */
export const meSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  nameEn: z.string().nullable(),
  /** The linked person's photo; null without one. */
  photoUrl: z.string().nullable(),
  /** The linked person is verified, so only the office may change the name. */
  nameLocked: z.boolean(),
  language: z.enum(['bn', 'en']),
});
export type Me = z.infer<typeof meSchema>;

/** `PATCH /me`: the user's own name (as on their person record). */
export const meUpdateSchema = z.object({
  name: text(200),
  nameEn: optionalText(200),
});
export type MeUpdateInput = z.infer<typeof meUpdateSchema>;

/** `GET /me`: the account plus what it may do (filters the dashboard nav). */
export const meWithAccessSchema = meSchema.extend({ access: accessSchema });
export type MeWithAccess = z.infer<typeof meWithAccessSchema>;

/**
 * Error bodies of `POST /auth/login` (inside the API's `{ statusCode, code, message, details }`):
 * 401 `invalid_credentials` with the attempts left, 423 `account_locked` with the unlock time.
 */
export const loginErrorDetails = z.union([
  z.object({ attemptsLeft: z.number().int().min(0) }),
  z.object({ lockedUntil: z.iso.datetime({ offset: true }) }),
]);
export type LoginErrorDetails = z.infer<typeof loginErrorDetails>;
