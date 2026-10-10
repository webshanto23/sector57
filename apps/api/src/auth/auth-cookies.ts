import { AUTH_COOKIES } from '@s57/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import type { IssuedTokens } from './auth.service.js';
import { ACCESS_TOKEN_MINUTES, REFRESH_TOKEN_DAYS } from './tokens.service.js';

/**
 * Same-site cookies only: the browser talks to the API through the web app's
 * `/api` rewrite, so these are first-party and `Lax` blocks cross-site posts.
 */
export function cookieOptions(env: Env, httpOnly: boolean, maxAgeMs: number): CookieOptions {
  return { httpOnly, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

export function setAuthCookies(response: Response, env: Env, tokens: IssuedTokens): void {
  const refreshMs = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;
  response.cookie(AUTH_COOKIES.access, tokens.accessToken, cookieOptions(env, true, ACCESS_TOKEN_MINUTES * 60 * 1000));
  response.cookie(AUTH_COOKIES.refresh, tokens.refreshToken, cookieOptions(env, true, refreshMs));
  // Readable by the page, which echoes it in the X-CSRF-Token header.
  response.cookie(AUTH_COOKIES.csrf, tokens.csrfToken, cookieOptions(env, false, refreshMs));
}

export function clearAuthCookies(response: Response, env: Env): void {
  for (const name of Object.values(AUTH_COOKIES)) {
    const { maxAge: _maxAge, ...options } = cookieOptions(env, name !== AUTH_COOKIES.csrf, 0);
    response.clearCookie(name, options);
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const value: unknown = (request.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
