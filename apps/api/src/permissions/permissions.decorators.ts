import { createParamDecorator, ExecutionContext, InternalServerErrorException, SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionModule } from '@s57/shared';
import type { Request } from 'express';
import type { CallerAccess } from './caller-access.js';

declare module 'express' {
  interface Request {
    access?: CallerAccess;
  }
}

export const REQUIRED_PERMISSION = 'requiredPermission';
export const ANY_LOGGED_IN = 'anyLoggedIn';

export type RequiredPermission = { module: PermissionModule; action: PermissionAction };

/**
 * The permission a route needs (anywhere in the society). Handlers that touch
 * location-bound rows still narrow their queries with `scopeWhere` or check the row
 * with `access.can(action, module, row)`.
 */
export const Can = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata(REQUIRED_PERMISSION, { module, action } satisfies RequiredPermission);

/** Any logged-in user, no permission needed (their own account, `/me`). Every other logged-in route needs `@Can`. */
export const Authenticated = () => SetMetadata(ANY_LOGGED_IN, true);

/** The caller's access, loaded by the permissions guard. Only on `@Can` and `@Authenticated` routes. */
export const CurrentAccess = createParamDecorator((_data: unknown, context: ExecutionContext): CallerAccess => {
  const access = context.switchToHttp().getRequest<Request>().access;
  if (!access) throw new InternalServerErrorException('Access not loaded');
  return access;
});
