import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_COOKIES, CSRF_HEADER } from '@s57/shared';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { cookieOptions } from './auth-cookies.js';
import { IS_PUBLIC, SKIP_CSRF } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { TokensService } from './tokens.service.js';

const env = { NODE_ENV: 'production', WEB_ORIGIN: ['https://sector57.example'], JWT_SECRET: 's'.repeat(32) } as Env;
const SOCIETY = '7e0b9a3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const user = { userId: '2b1f0f8e-7d5a-4c4b-9f55-8d0e0e6c1a01', societyId: SOCIETY, sessionId: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c' };

function contextFor(request: Partial<Request>, metadata: Record<string, boolean> = {}) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(new Reflector(), env);
  const post = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
    ({ method: 'POST', headers, cookies }) as unknown as Request;

  it('lets safe methods through', () => {
    expect(guard.canActivate(contextFor({ method: 'GET', headers: {} }))).toBe(true);
  });

  it('accepts a matching token from an allowed origin, or with no origin (server to server)', () => {
    const cookies = { [AUTH_COOKIES.csrf]: 'token-123' };
    expect(guard.canActivate(contextFor(post({ origin: 'https://sector57.example', [CSRF_HEADER]: 'token-123' }, cookies)))).toBe(true);
    expect(guard.canActivate(contextFor(post({ [CSRF_HEADER]: 'token-123' }, cookies)))).toBe(true);
  });

  it('rejects a missing or different token', () => {
    const cookies = { [AUTH_COOKIES.csrf]: 'token-123' };
    expect(() => guard.canActivate(contextFor(post({}, cookies)))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(post({ [CSRF_HEADER]: 'token-124' }, cookies)))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(post({ [CSRF_HEADER]: 'token-123' })))).toThrow(ForbiddenException);
  });

  it('rejects a foreign origin even on routes that skip the token check', () => {
    const request = post({ origin: 'https://evil.example' });
    expect(() => guard.canActivate(contextFor(request, { [SKIP_CSRF]: true }))).toThrow(/unknown site/);
    expect(guard.canActivate(contextFor(post({ origin: 'https://sector57.example' }), { [SKIP_CSRF]: true }))).toBe(true);
  });
});

describe('AuthGuard', () => {
  const tokens = new TokensService(env);
  const guard = new AuthGuard(tokens, new Reflector());
  const requestWith = async (societyId: string, token?: string) =>
    ({
      society: { id: societyId },
      cookies: token === undefined ? {} : { [AUTH_COOKIES.access]: token },
    }) as unknown as Request;

  it('skips public routes', async () => {
    await expect(guard.canActivate(contextFor({}, { [IS_PUBLIC]: true }))).resolves.toBe(true);
  });

  it('attaches the caller for a valid token of this society', async () => {
    const request = await requestWith(SOCIETY, await tokens.signAccess(user));
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toEqual(user);
  });

  it('rejects no token, a bad token and a token of another society', async () => {
    const otherSociety = 'a3c1f9e2-1111-4222-8333-944455556666';
    for (const request of [
      await requestWith(SOCIETY),
      await requestWith(SOCIETY, 'garbage'),
      await requestWith(otherSociety, await tokens.signAccess(user)),
    ]) {
      await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
    }
  });
});

describe('cookieOptions', () => {
  it('is httpOnly, Lax and Secure in production', () => {
    expect(cookieOptions(env, true, 1000)).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 1000 });
  });

  it('drops Secure outside production so http://localhost works', () => {
    expect(cookieOptions({ ...env, NODE_ENV: 'development' }, false, 1000)).toMatchObject({ httpOnly: false, secure: false });
  });
});
