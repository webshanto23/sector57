import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './tokens.service.js';

declare module 'express' {
  interface Request {
    auth?: AuthUser;
  }
}

export const IS_PUBLIC = 'isPublic';
export const SKIP_CSRF = 'skipCsrf';

/** Open to everyone. Every other route needs a logged-in user (default deny). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * No CSRF token check (the Origin check still runs). Only for unsafe routes a
 * visitor calls before they have a CSRF cookie: the login form, later the public forms.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

/** The logged-in caller. Only on routes that are not `@Public()`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const auth = context.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
  return auth;
});
