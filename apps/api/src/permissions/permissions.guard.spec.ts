import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../auth/auth.decorators.js';
import type { AbilityService } from './ability.service.js';
import { CallerAccess } from './caller-access.js';
import { ANY_LOGGED_IN, REQUIRED_PERMISSION } from './permissions.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

const user = {
  userId: '2b1f0f8e-7d5a-4c4b-9f55-8d0e0e6c1a01',
  societyId: '7e0b9a3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  sessionId: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
};

function contextFor(request: Partial<Request>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(permissions: string[]) {
  const load = vi.fn(async () =>
    new CallerAccess([
      {
        isSystem: false,
        scopeLocationId: null,
        scopePath: null,
        permissions: permissions.map((p) => ({ module: p.split(':')[0]!, action: p.split(':')[1]! })),
      },
    ]),
  );
  return { guard: new PermissionsGuard({ load } as unknown as AbilityService, new Reflector()), load };
}

describe('PermissionsGuard', () => {
  it('lets public routes through without loading anything', async () => {
    const { guard, load } = guardWith([]);
    await expect(guard.canActivate(contextFor({}, { [IS_PUBLIC]: true }))).resolves.toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('denies a logged-in route that declares nothing', async () => {
    const { guard } = guardWith(['members:view']);
    await expect(guard.canActivate(contextFor({ auth: user }))).rejects.toThrow(ForbiddenException);
  });

  it('allows @Authenticated routes for any logged-in user and loads their access', async () => {
    const { guard } = guardWith([]);
    const request: Partial<Request> = { auth: user };
    await expect(guard.canActivate(contextFor(request, { [ANY_LOGGED_IN]: true }))).resolves.toBe(true);
    expect(request.access).toBeInstanceOf(CallerAccess);
  });

  it('checks @Can against the caller and loads once per request', async () => {
    const { guard, load } = guardWith(['members:view']);
    const request: Partial<Request> = { auth: user };
    await expect(
      guard.canActivate(contextFor(request, { [REQUIRED_PERMISSION]: { module: 'members', action: 'view' } })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(request, { [REQUIRED_PERMISSION]: { module: 'members', action: 'edit' } })),
    ).rejects.toThrow(/permission/);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('needs a login on non-public routes', async () => {
    const { guard } = guardWith([]);
    await expect(guard.canActivate(contextFor({}, { [ANY_LOGGED_IN]: true }))).rejects.toThrow(UnauthorizedException);
  });
});
