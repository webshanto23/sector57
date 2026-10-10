import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_COOKIES, CSRF_HEADER } from '@s57/shared';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';
import { readCookie } from './auth-cookies.js';
import { SKIP_CSRF } from './auth.decorators.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Global guard for requests that change data (POST, PUT, PATCH, DELETE):
 * 1. A browser `Origin` header, when present, must be one of `WEB_ORIGIN`.
 * 2. The `X-CSRF-Token` header must equal the CSRF cookie (double submit), so a
 *    page on another site can't forge the request even if a cookie rides along.
 * Server-to-server calls (the Next server) send no Origin and copy the cookie into the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && !this.env.WEB_ORIGIN.includes(origin)) {
      throw new ForbiddenException({ code: 'origin_not_allowed', message: 'Request from an unknown site' });
    }
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [context.getHandler(), context.getClass()])) return true;

    const cookie = readCookie(request, AUTH_COOKIES.csrf);
    const header = request.headers[CSRF_HEADER];
    if (!cookie || typeof header !== 'string' || !sameToken(cookie, header)) {
      throw new ForbiddenException({ code: 'csrf_failed', message: 'Security check failed. Reload the page and try again.' });
    }
    return true;
  }
}
