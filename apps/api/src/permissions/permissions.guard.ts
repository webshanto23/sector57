import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../auth/auth.decorators.js';
import { AbilityService } from './ability.service.js';
import { ANY_LOGGED_IN, REQUIRED_PERMISSION, type RequiredPermission } from './permissions.decorators.js';

/**
 * Global guard, after the auth guard. A logged-in route runs only if it says what it
 * needs: `@Can(module, action)` checked against the caller's roles, or `@Authenticated()`.
 * A route with neither is denied (default deny). Roles are never checked by name.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly abilities: AbilityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
    // Loaded once per request; handlers read it with @CurrentAccess().
    request.access ??= await this.abilities.load(request.auth);

    if (this.reflector.getAllAndOverride<boolean>(ANY_LOGGED_IN, targets)) return true;
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRED_PERMISSION, targets);
    if (!required || !request.access.can(required.action, required.module)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    }
    return true;
  }
}
