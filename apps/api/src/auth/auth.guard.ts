import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_COOKIES } from '@s57/shared';
import type { Request } from 'express';
import { readCookie } from './auth-cookies.js';
import { IS_PUBLIC } from './auth.decorators.js';
import { TokensService } from './tokens.service.js';

/**
 * Global guard, after the society guard: every route needs a valid access token
 * for the request's society unless it is marked `@Public()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = await this.tokens.verifyAccess(readCookie(request, AUTH_COOKIES.access));
    // A token from another society is no token at all here.
    if (!user || !request.society || user.societyId !== request.society.id) {
      throw new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
    }
    request.auth = user;
    return true;
  }
}
